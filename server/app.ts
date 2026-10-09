import express from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { withTransaction } from './sqlite-util.ts';
import { recordRecent, listRecent } from './recent.ts';
import { buildDraftExport } from './draft-export.ts';
import {
  REF_RE,
  buildLaunchUrl,
  launchWorkbuddy,
  lookupLaunchRecord,
  resolveWorkbuddyExe,
  exeCandidates,
  type SpawnFn,
} from './launch.ts';

export interface ImportResult {
  skills: number;
  experts: number;
  categories: number;
  warnings: string[];
}

export interface AvatarProxy {
  handle(req: any, res: any): Promise<void>;
  refresh(): void;
  describe(): Record<string, unknown>;
}

export interface AppDeps {
  db: DatabaseSync;
  getAutomations: () => { rows: any[]; error?: string };
  importSkillsExperts: () => ImportResult;
  serveStatic?: boolean;
  distDir?: string;
  avatarProxy?: AvatarProxy;
  /** 注入点：测试用假 spawn，绝不启动真实进程 */
  spawnFn?: SpawnFn;
  workbuddyExe?: string | null;
  env?: NodeJS.ProcessEnv;
}

const LAUNCH_NOTE =
  '已在 WorkBuddy 中打开对应页面。WorkBuddy 没有"注入并自动发送 prompt"的协议入口，请把启动提示粘贴到 WorkBuddy 对话框后发送。';

/**
 * 创建 Express 应用。
 * 关键约束：不读 process.env、不开数据库、不 import 具体数据源、不 listen —— 全部依赖经参数注入，便于测试。
 */
export function createApp(deps: AppDeps): express.Express {
  const { db } = deps;
  const env = deps.env ?? process.env;
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // ---------- 仪表盘统计 ----------
  app.get('/api/stats', (_req, res) => {
    const skillTotal = (db.prepare('SELECT COUNT(*) c FROM skills').get() as any).c;
    const bySource = db.prepare('SELECT source, COUNT(*) c FROM skills GROUP BY source').all();
    const expertTotal = (db.prepare('SELECT COUNT(*) c FROM experts').get() as any).c;
    const byCategory = db
      .prepare('SELECT category_id, COUNT(*) c FROM experts GROUP BY category_id')
      .all();
    const taskByStatus = db.prepare('SELECT status, COUNT(*) c FROM tasks GROUP BY status').all();
    const auto = deps.getAutomations();
    const autoEnabled = auto.rows.filter((r: any) => r.status === 'ACTIVE').length;
    res.json({
      skills: { total: skillTotal, bySource },
      experts: { total: expertTotal, byCategory },
      tasks: { byStatus: taskByStatus },
      automations: {
        total: auto.rows.length,
        enabled: autoEnabled,
        error: auto.error || null,
      },
    });
  });

  // ---------- 技能中心 ----------
  app.get('/api/skills', (req, res) => {
    const q = (req.query.query as string) || '';
    const source = req.query.source as string;
    const disabled = req.query.disabled as string;
    const clauses: string[] = [];
    const params: any[] = [];
    if (q) {
      clauses.push('(name LIKE ? OR description_zh LIKE ? OR slug LIKE ?)');
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    if (source) {
      clauses.push('source = ?');
      params.push(source);
    }
    if (disabled === '1' || disabled === '0') {
      clauses.push('disabled = ?');
      params.push(Number(disabled));
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize as string) || 50));
    const total = (db.prepare(`SELECT COUNT(*) c FROM skills ${where}`).get(...params) as any).c;
    const rows = db
      .prepare(
        `SELECT slug,name,description_zh,source,type,disabled,version,marketplace_source FROM skills ${where} ORDER BY name LIMIT ? OFFSET ?`
      )
      .all(...params, pageSize, (page - 1) * pageSize);
    res.json({ rows, total, page, pageSize });
  });

  app.get('/api/skills/:slug', (req, res) => {
    const row = db.prepare('SELECT * FROM skills WHERE slug = ?').get(req.params.slug);
    if (!row) return res.status(404).json({ error: 'not found' });
    recordRecent(db, 'skill', req.params.slug);
    res.json(row);
  });

  // ---------- 专家目录 ----------
  app.get('/api/expert-categories', (_req, res) => {
    const rows = db
      .prepare(
        `SELECT c.*, (SELECT COUNT(*) FROM experts e WHERE e.category_id = c.id) AS count
         FROM expert_categories c ORDER BY c.id`
      )
      .all();
    res.json(rows);
  });

  app.get('/api/experts', (req, res) => {
    const q = (req.query.query as string) || '';
    const categoryId = req.query.categoryId as string;
    const tag = req.query.tag as string;
    const isOpc = req.query.isOpc as string;
    const clauses: string[] = [];
    const params: any[] = [];
    if (q) {
      clauses.push(
        '(display_name_zh LIKE ? OR display_name_en LIKE ? OR profession_zh LIKE ? OR description_zh LIKE ? OR agent_name LIKE ?)'
      );
      params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
    }
    if (categoryId) {
      clauses.push('category_id = ?');
      params.push(categoryId);
    }
    if (isOpc === '1') {
      clauses.push('is_opc = 1');
    }
    if (tag) {
      clauses.push('(tags_zh LIKE ? OR tags_en LIKE ?)');
      params.push(`%"${tag}"%`, `%"${tag}"%`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize as string) || 50));
    const total = (db.prepare(`SELECT COUNT(*) c FROM experts ${where}`).get(...params) as any).c;
    const rows = db
      .prepare(
        `SELECT id,display_name_zh,display_name_en,profession_zh,category_id,expert_type,is_opc,avatar FROM experts ${where} ORDER BY display_name_zh LIMIT ? OFFSET ?`
      )
      .all(...params, pageSize, (page - 1) * pageSize);
    res.json({ rows, total, page, pageSize });
  });

  app.get('/api/experts/:id', (req, res) => {
    const row = db.prepare('SELECT * FROM experts WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'not found' });
    recordRecent(db, 'expert', req.params.id);
    res.json(row);
  });

  // ---------- 专家头像（代理远程 CDN，见 expert-avatar.ts） ----------
  app.get('/api/expert-avatars/:id', (req, res, next) => {
    if (!deps.avatarProxy) return res.status(404).json({ error: 'not found' });
    deps.avatarProxy.handle(req, res).catch(next);
  });

  // 头像诊断（设置页展示；不含任何敏感信息）
  app.get('/api/expert-avatars-info', (_req, res) => {
    if (!deps.avatarProxy) return res.status(404).json({ error: 'not found' });
    const pref = db.prepare("SELECT value FROM app_prefs WHERE key='avatarsRemote'").get() as any;
    res.json({
      ...deps.avatarProxy.describe(),
      remoteEnabled: !pref || pref.value !== '0',
    });
  });

  // ---------- 任务 / 待办 ----------
  app.get('/api/tasks', (_req, res) => {
    res.json(db.prepare('SELECT * FROM tasks ORDER BY order_idx, created_at').all());
  });

  app.post('/api/tasks', (req, res) => {
    const b = req.body || {};
    const id = randomUUID();
    const now = Date.now();
    db.prepare(
      `INSERT INTO tasks (id,title,status,due_date,project,tags,notes,order_idx,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    ).run(
      id,
      b.title || '未命名任务',
      b.status || 'todo',
      b.due_date ?? null,
      b.project || null,
      JSON.stringify(b.tags || []),
      b.notes || null,
      b.order_idx ?? 0,
      now,
      now
    );
    res.status(201).json(db.prepare('SELECT * FROM tasks WHERE id=?').get(id));
  });

  app.patch('/api/tasks/:id', (req, res) => {
    const b = req.body || {};
    const existing = db.prepare('SELECT * FROM tasks WHERE id=?').get(req.params.id) as any;
    if (!existing) return res.status(404).json({ error: 'not found' });
    db.prepare(
      `UPDATE tasks SET title=?,status=?,due_date=?,project=?,tags=?,notes=?,order_idx=?,updated_at=? WHERE id=?`
    ).run(
      b.title ?? existing.title,
      b.status ?? existing.status,
      b.due_date !== undefined ? b.due_date : existing.due_date,
      b.project !== undefined ? b.project : existing.project,
      b.tags !== undefined ? JSON.stringify(b.tags) : existing.tags,
      b.notes !== undefined ? b.notes : existing.notes,
      b.order_idx !== undefined ? b.order_idx : existing.order_idx,
      Date.now(),
      req.params.id
    );
    res.json(db.prepare('SELECT * FROM tasks WHERE id=?').get(req.params.id));
  });

  app.delete('/api/tasks/:id', (req, res) => {
    db.prepare('DELETE FROM tasks WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  });

  // 看板拖拽：批量更新状态与排序（事务，失败整体回滚）
  app.post('/api/tasks/reorder', (req, res) => {
    const updates: any[] = req.body?.updates || [];
    withTransaction(db, () => {
      const upd = db.prepare('UPDATE tasks SET status=?, order_idx=?, updated_at=? WHERE id=?');
      for (const u of updates) {
        upd.run(u.status, u.order_idx ?? 0, Date.now(), u.id);
      }
    });
    res.json(db.prepare('SELECT * FROM tasks ORDER BY order_idx, created_at').all());
  });

  // ---------- 自动化（只读镜像 WorkBuddy） ----------
  app.get('/api/automations', (_req, res) => {
    res.json(deps.getAutomations());
  });

  // ---------- 自动化编排草稿 ----------
  app.get('/api/automation-drafts', (_req, res) => {
    res.json(db.prepare('SELECT * FROM automation_drafts ORDER BY created_at DESC').all());
  });

  app.post('/api/automation-drafts', (req, res) => {
    const b = req.body || {};
    const id = randomUUID();
    const now = Date.now();
    db.prepare(
      `INSERT INTO automation_drafts (id,name,prompt,status,schedule_type,rrule,scheduled_at,skills_json,expert_id,connector_ids_json,cwds,model_id,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      id,
      b.name || '未命名草稿',
      b.prompt || null,
      b.status || 'draft',
      b.schedule_type || null,
      b.rrule || null,
      b.scheduled_at || null,
      JSON.stringify(b.skills || []),
      b.expert_id || null,
      JSON.stringify(b.connector_ids || []),
      b.cwds || null,
      b.model_id || null,
      now,
      now
    );
    res.status(201).json(db.prepare('SELECT * FROM automation_drafts WHERE id=?').get(id));
  });

  app.patch('/api/automation-drafts/:id', (req, res) => {
    const b = req.body || {};
    const ex = db.prepare('SELECT * FROM automation_drafts WHERE id=?').get(req.params.id) as any;
    if (!ex) return res.status(404).json({ error: 'not found' });
    db.prepare(
      `UPDATE automation_drafts SET name=?,prompt=?,status=?,schedule_type=?,rrule=?,scheduled_at=?,skills_json=?,expert_id=?,connector_ids_json=?,cwds=?,model_id=?,updated_at=? WHERE id=?`
    ).run(
      b.name ?? ex.name,
      b.prompt !== undefined ? b.prompt : ex.prompt,
      b.status ?? ex.status,
      b.schedule_type !== undefined ? b.schedule_type : ex.schedule_type,
      b.rrule !== undefined ? b.rrule : ex.rrule,
      b.scheduled_at !== undefined ? b.scheduled_at : ex.scheduled_at,
      b.skills !== undefined ? JSON.stringify(b.skills) : ex.skills_json,
      b.expert_id !== undefined ? b.expert_id : ex.expert_id,
      b.connector_ids !== undefined ? JSON.stringify(b.connector_ids) : ex.connector_ids_json,
      b.cwds !== undefined ? b.cwds : ex.cwds,
      b.model_id !== undefined ? b.model_id : ex.model_id,
      Date.now(),
      req.params.id
    );
    res.json(db.prepare('SELECT * FROM automation_drafts WHERE id=?').get(req.params.id));
  });

  app.delete('/api/automation-drafts/:id', (req, res) => {
    db.prepare('DELETE FROM automation_drafts WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  });

  app.get('/api/automation-drafts/:id/export', (req, res) => {
    const d = db.prepare('SELECT * FROM automation_drafts WHERE id=?').get(req.params.id) as any;
    if (!d) return res.status(404).json({ error: 'not found' });
    res.json(buildDraftExport(d));
  });

  // ---------- 导入 / 刷新 ----------
  app.post('/api/import', (_req, res) => {
    const r = deps.importSkillsExperts();
    deps.avatarProxy?.refresh(); // 导入会整体重写 experts，头像映射表必须同步刷新
    res.json({ ok: true, ...r });
  });

  app.post('/api/automations/refresh', (_req, res) => {
    res.json(deps.getAutomations());
  });

  // ---------- 启动技能 / 专家 ----------
  // 诊断信息：WorkBuddy.exe 位置与可用性（设置页展示）
  app.get('/api/launch', (_req, res) => {
    const exePath = deps.workbuddyExe ?? resolveWorkbuddyExe(env);
    res.json({
      exePath,
      available: !!exePath && (deps.workbuddyExe ? true : existsSync(exePath as string)),
      candidates: exeCandidates(env),
    });
  });

  app.post('/api/launch', (req, res) => {
    const { type, ref } = req.body || {};
    if (!type || !ref) return res.status(400).json({ error: 'type 与 ref 必填' });
    const refStr = String(ref);
    if (!REF_RE.test(refStr)) return res.status(400).json({ error: 'ref 格式非法' });
    const url = buildLaunchUrl(String(type), refStr);
    if (!url) return res.status(400).json({ error: '不支持的 type' });
    // 必须在本库命中，避免为不存在的对象生成"看起来合法"的跳转
    const record = lookupLaunchRecord(db, String(type), refStr);
    if (!record.found) return res.status(404).json({ error: 'not found' });

    const spawn = launchWorkbuddy(url, {
      exePath: deps.workbuddyExe,
      spawnFn: deps.spawnFn,
      env,
    });
    res.json({
      ok: true,
      type,
      ref: refStr,
      url,
      mode: spawn.ok ? 'spawned' : 'url-only',
      fallbackPrompt: record.fallbackPrompt,
      spawn,
      note: LAUNCH_NOTE,
    });
  });

  // ---------- 最近使用 ----------
  app.get('/api/recent', (_req, res) => {
    res.json(listRecent(db));
  });

  // ---------- 偏好 ----------
  app.get('/api/prefs', (_req, res) => {
    const rows = db.prepare('SELECT * FROM app_prefs').all();
    const obj: Record<string, string> = {};
    for (const r of rows as any[]) obj[r.key] = r.value;
    res.json(obj);
  });

  app.put('/api/prefs', (req, res) => {
    const body = req.body || {};
    withTransaction(db, () => {
      for (const [k, v] of Object.entries(body)) {
        db.prepare('INSERT OR REPLACE INTO app_prefs (key,value) VALUES (?,?)').run(k, String(v));
      }
    });
    res.json({ ok: true });
  });

  // ---------- 静态托管（生产；测试中关闭以免遮蔽） ----------
  const distDir = deps.distDir ?? join(process.cwd(), 'dist');
  if (deps.serveStatic && existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      res.sendFile(join(distDir, 'index.html'));
    });
  }

  // API 404 统一返回 JSON（而非 Express 默认 HTML）
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'not found' });
  });

  // 统一错误处理：畸形 JSON 属客户端错误 → 400；其余 → 500。绝不返回 HTML 堆栈页。
  app.use((err: any, _req: any, res: any, _next: any) => {
    const badRequest = err?.type === 'entity.parse.failed';
    if (!badRequest) console.error('[server] error:', err?.message || err);
    res.status(badRequest ? 400 : 500).json({ error: err?.message || 'internal error' });
  });

  return app;
}
