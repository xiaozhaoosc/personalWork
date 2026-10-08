import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { db, runMigrations } from './db.ts';
import { importSkillsExperts, WORKBUDDY_USER_DIR } from './import.ts';
import { getAutomations } from './workbuddy.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3001;

runMigrations();
// 首次启动若为空则自动导入
const initCount = (db.prepare('SELECT COUNT(*) c FROM skills').get() as any).c;
if (initCount === 0) {
  const r = importSkillsExperts();
  console.log('[import] 首次自动导入:', r);
}

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
  const auto = getAutomations();
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
  recordRecent('skill', req.params.slug);
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
    clauses.push('(display_name_zh LIKE ? OR display_name_en LIKE ? OR profession_zh LIKE ? OR description_zh LIKE ? OR agent_name LIKE ?)');
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
  recordRecent('expert', req.params.id);
  res.json(row);
});

// ---------- 任务 / 待办 ----------
app.get('/api/tasks', (_req, res) => {
  const rows = db.prepare('SELECT * FROM tasks ORDER BY order_idx, created_at').all();
  res.json(rows);
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

// ---------- 自动化（只读镜像 WorkBuddy） ----------
app.get('/api/automations', (_req, res) => {
  res.json(getAutomations());
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

// 导出草稿为 WorkBuddy 可用的创建材料：对齐 automations 字段的 JSON + 可粘贴的中文创建指令
app.get('/api/automation-drafts/:id/export', (req, res) => {
  const d = db.prepare('SELECT * FROM automation_drafts WHERE id=?').get(req.params.id) as any;
  if (!d) return res.status(404).json({ error: 'not found' });

  const skills: string[] = JSON.parse(d.skills_json || '[]');
  const connectorIds: string[] = JSON.parse(d.connector_ids_json || '[]');
  const cwds: string[] = (d.cwds || '')
    .split(/[,;，；]/)
    .map((s: string) => s.trim())
    .filter(Boolean);

  const isOnce = d.schedule_type === 'once';
  const payload: any = {
    name: d.name,
    prompt: d.prompt || '',
    scheduleType: isOnce ? 'once' : 'recurring',
    status: 'PAUSED',
    skills,
    connectorIds,
  };
  if (isOnce) payload.scheduledAt = d.scheduled_at || undefined;
  else payload.rrule = d.rrule || undefined;
  if (d.expert_id) payload.expertId = d.expert_id;
  if (cwds.length) payload.cwds = cwds;
  if (d.model_id) payload.modelId = d.model_id;

  const plan = isOnce
    ? `一次性执行：${d.scheduled_at || '（未设置时间，请补充）'}`
    : `周期执行（RRULE: ${d.rrule || '（未设置，请补充）'}）`;
  const prompt = [
    '请帮我创建一个自动化任务，创建后保持暂停（PAUSED）状态，待我确认后再启用：',
    `- 名称：${d.name}`,
    `- 执行内容：${d.prompt || '（无）'}`,
    `- 计划：${plan}`,
    skills.length ? `- 使用技能：${skills.join('、')}` : '',
    d.expert_id ? `- 使用专家：${d.expert_id}` : '',
    cwds.length ? `- 工作目录：${cwds.join('、')}` : '',
    d.model_id ? `- 模型：${d.model_id}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  res.json({
    json: payload,
    prompt,
    note: 'deep-link 协议尚未核实（OQ1），请将指令粘贴到 WorkBuddy 对话中创建；JSON 仅供程序化使用。',
  });
});

// ---------- 导入 / 刷新 ----------
app.post('/api/import', (_req, res) => {
  const r = importSkillsExperts();
  res.json({ ok: true, ...r });
});

app.post('/api/automations/refresh', (_req, res) => {
  res.json(getAutomations());
});

// ---------- 启动技能 / 专家（deep-link + 回退） ----------
function buildLaunch(type: string, ref: string) {
  if (type === 'skill') {
    const row = db.prepare('SELECT name,description,examples_zh FROM skills WHERE slug=?').get(ref) as any;
    let fallback = ref;
    if (row) {
      const examples = row.examples_zh ? JSON.parse(row.examples_zh).join('；') : '';
      fallback = `${row.name}\n${row.description || ''}${examples ? '\n示例：' + examples : ''}`;
    }
    return { deepLink: `workbuddy://skill/${ref}`, fallbackPrompt: fallback };
  }
  const row = db.prepare('SELECT display_name_zh,default_init_prompt_zh FROM experts WHERE id=?').get(ref) as any;
  const fallback = row ? row.default_init_prompt_zh || row.display_name_zh || ref : ref;
  return { deepLink: `workbuddy://expert/${ref}`, fallbackPrompt: fallback };
}

app.post('/api/launch', (req, res) => {
  const { type, ref } = req.body || {};
  if (!type || !ref) return res.status(400).json({ error: 'type 与 ref 必填' });
  res.json({
    ...buildLaunch(type, ref),
    note: '若 deep-link 未自动唤起 WorkBuddy，请复制 fallbackPrompt 到 WorkBuddy 窗口。',
  });
});

// ---------- 最近使用 ----------
app.get('/api/recent', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT r.kind, r.ref_key, r.last_opened_at,
              CASE r.kind
                WHEN 'skill' THEN (SELECT name FROM skills WHERE slug = r.ref_key)
                WHEN 'expert' THEN COALESCE((SELECT display_name_zh FROM experts WHERE id = r.ref_key),
                                            (SELECT display_name_en FROM experts WHERE id = r.ref_key))
              END AS name
       FROM recent_items r ORDER BY r.last_opened_at DESC LIMIT 12`
    )
    .all();
  res.json(rows);
});

function recordRecent(kind: string, refKey: string) {
  db.prepare(
    'INSERT OR REPLACE INTO recent_items (kind,ref_key,last_opened_at) VALUES (?,?,?)'
  ).run(kind, refKey, Date.now());
}

// ---------- 偏好 ----------
app.get('/api/prefs', (_req, res) => {
  const rows = db.prepare('SELECT * FROM app_prefs').all();
  const obj: Record<string, string> = {};
  for (const r of rows as any[]) obj[r.key] = r.value;
  res.json(obj);
});

app.put('/api/prefs', (req, res) => {
  const body = req.body || {};
  for (const [k, v] of Object.entries(body)) {
    db.prepare('INSERT OR REPLACE INTO app_prefs (key,value) VALUES (?,?)').run(k, String(v));
  }
  res.json({ ok: true });
});

// ---------- 静态托管（生产） ----------
const dist = join(__dirname, '..', 'dist');
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(join(dist, 'index.html'));
  });
}

// API 404 统一返回 JSON（而非 Express 默认 HTML）
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'not found' });
});

// 统一错误处理：返回 JSON，避免把堆栈暴露成 HTML 页
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error('[server] error:', err?.message || err);
  res.status(500).json({ error: err?.message || 'internal error' });
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[server] 个人工作台 API 运行于 http://localhost:${PORT}`);
  console.log(`[server] WorkBuddy 用户目录: ${WORKBUDDY_USER_DIR}`);
});

export { app };
