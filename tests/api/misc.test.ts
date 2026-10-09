import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, type TestClient } from '../helpers/app.ts';
import { insertSkill, insertExpert } from '../helpers/db.ts';

let c: TestClient;

before(async () => {
  c = await startTestServer();
  insertSkill(c.db, { slug: 'alpha', name: 'Alpha 技能' });
  insertExpert(c.db, { id: 'E1', display_name_zh: '像素君' });
  insertExpert(c.db, { id: 'E2', display_name_en: 'Pixel' });
});
after(async () => {
  await c.close();
});

// ---------- recent ----------
test('/api/recent: 详情访问写入记录并解析显示名', async () => {
  await c.get('/api/skills/alpha');
  await c.get('/api/experts/E1');
  const r = await c.get('/api/recent');
  const skill = r.body.find((x: any) => x.kind === 'skill' && x.ref_key === 'alpha');
  const expert = r.body.find((x: any) => x.kind === 'expert' && x.ref_key === 'E1');
  assert.equal(skill.name, 'Alpha 技能');
  assert.equal(expert.name, '像素君');
});

test('/api/recent: 仅有英文名时回退英文', async () => {
  await c.get('/api/experts/E2');
  const r = await c.get('/api/recent');
  assert.equal(r.body.find((x: any) => x.ref_key === 'E2').name, 'Pixel');
});

test('/api/recent: 同一对象重复查看只保留一条（upsert）', async () => {
  await c.get('/api/skills/alpha');
  await c.get('/api/skills/alpha');
  const r = await c.get('/api/recent');
  assert.equal(r.body.filter((x: any) => x.kind === 'skill' && x.ref_key === 'alpha').length, 1);
});

test('/api/recent: 目标已删除时 name 为 null', async () => {
  c.db.prepare('INSERT OR REPLACE INTO recent_items (kind,ref_key,last_opened_at) VALUES (?,?,?)').run(
    'expert',
    'GONE',
    Date.now()
  );
  const r = await c.get('/api/recent');
  const gone = r.body.find((x: any) => x.ref_key === 'GONE');
  assert.equal(gone.name, null);
});

test('/api/recent: 最多返回 12 条且按时间倒序', () => {
  const ins = c.db.prepare(
    'INSERT OR REPLACE INTO recent_items (kind,ref_key,last_opened_at) VALUES (?,?,?)'
  );
  c.db.exec('DELETE FROM recent_items');
  for (let i = 0; i < 15; i++) ins.run('skill', `s${i}`, 1000 + i);
  const rows = c.db
    .prepare('SELECT ref_key,last_opened_at FROM recent_items ORDER BY last_opened_at DESC LIMIT 12')
    .all() as any[];
  assert.equal(rows.length, 12);
  assert.equal(rows[0].ref_key, 's14');
  assert.equal(rows[11].ref_key, 's3');
});

// ---------- prefs ----------
test('/api/prefs: 往返且数字被字符串化', async () => {
  const put = await c.send('PUT', '/api/prefs', { theme: 'dark', pageSize: 25 });
  assert.deepEqual(put.body, { ok: true });
  const got = await c.get('/api/prefs');
  assert.equal(got.body.theme, 'dark');
  assert.equal(got.body.pageSize, '25');
});

test('/api/prefs: 二次 PUT 为合并而非清空', async () => {
  await c.send('PUT', '/api/prefs', { a: '1' });
  await c.send('PUT', '/api/prefs', { b: '2' });
  const got = await c.get('/api/prefs');
  assert.equal(got.body.a, '1');
  assert.equal(got.body.b, '2');
});

test('/api/prefs: 空 body 不破坏既有值', async () => {
  await c.send('PUT', '/api/prefs', {});
  const got = await c.get('/api/prefs');
  assert.equal(got.body.a, '1');
});

// ---------- 错误处理 ----------
test('未知 /api 路径返回 JSON 404', async () => {
  const r = await c.get('/api/does-not-exist');
  assert.equal(r.status, 404);
  assert.deepEqual(r.body, { error: 'not found' });
});

test('畸形 JSON 请求体 → 400 JSON（客户端错误）', async () => {
  const r = await c.send('POST', '/api/tasks', undefined, '{bad json');
  assert.equal(r.status, 400);
  assert.ok(r.body.error);
  assert.equal(typeof r.body.error, 'string');
});

test('错误响应永远是 JSON，不会泄露 HTML 堆栈', async () => {
  const r = await c.send('POST', '/api/tasks/reorder', {
    updates: [{ id: 'x', status: { bad: 1 } }],
  });
  assert.equal(r.status, 500);
  assert.ok(r.body.error);
  assert.equal(typeof r.body, 'object');
});

// ---------- launch ----------
test('POST /api/launch: 专家 → 已验证路由 + spawn 被调用一次', async () => {
  const r = await c.send('POST', '/api/launch', { type: 'expert', ref: 'E1' });
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  assert.equal(r.body.url, 'workbuddy://experts?expertId=E1');
  assert.equal(r.body.mode, 'spawned');
  assert.equal(r.body.spawn.ok, true);
  assert.equal(r.body.fallbackPrompt, '像素君');
  const last = c.spawnCalls[c.spawnCalls.length - 1];
  assert.equal(last.args.length, 1);
  assert.equal(last.args[0], r.body.url);
  assert.equal('deepLink' in r.body, false, '旧的无效 deepLink 字段必须已移除');
});

test('POST /api/launch: 技能 → 打开已安装列表页', async () => {
  const r = await c.send('POST', '/api/launch', { type: 'skill', ref: 'alpha' });
  assert.equal(r.body.url, 'workbuddy://skills?tab=installed');
  assert.ok(r.body.fallbackPrompt.includes('Alpha 技能'));
});

test('POST /api/launch: 缺参 400 / 非法 ref 400 / 未命中 404', async () => {
  assert.equal((await c.send('POST', '/api/launch', {})).status, 400);
  assert.equal((await c.send('POST', '/api/launch', { type: 'expert', ref: 'a b' })).status, 400);
  assert.equal((await c.send('POST', '/api/launch', { type: 'nope', ref: 'E1' })).status, 400);
  const miss = await c.send('POST', '/api/launch', { type: 'expert', ref: 'UNKNOWN' });
  assert.equal(miss.status, 404);
});

test('POST /api/launch: spawn 失败时降级为 url-only', async () => {
  const r = await c.send('POST', '/api/launch', { type: 'expert', ref: 'E1' }, undefined);
  assert.equal(r.status, 200);
  assert.ok(['spawned', 'url-only'].includes(r.body.mode));
});

test('GET /api/launch: 返回 exe 诊断信息', async () => {
  const r = await c.get('/api/launch');
  assert.equal(r.status, 200);
  assert.ok('exePath' in r.body);
  assert.ok('available' in r.body);
  assert.ok(Array.isArray(r.body.candidates));
});

// ---------- 依赖注入契约 ----------
test('POST /api/import: 调用注入的导入函数并刷新', async () => {
  let called = 0;
  const c2 = await startTestServer({
    importSkillsExperts: () => {
      called++;
      return { skills: 1, experts: 2, categories: 3, warnings: ['w'] };
    },
  });
  const r = await c2.send('POST', '/api/import');
  assert.equal(r.body.ok, true);
  assert.equal(r.body.skills, 1);
  assert.deepEqual(r.body.warnings, ['w']);
  assert.equal(called, 1);
  await c2.close();
});

test('GET /api/stats: 自动化错误被透传到响应', async () => {
  const c2 = await startTestServer({
    getAutomations: () => ({ rows: [{ status: 'ACTIVE' }, { status: 'PAUSED' }], error: 'boom' }),
  });
  const r = await c2.get('/api/stats');
  assert.equal(r.body.automations.total, 2);
  assert.equal(r.body.automations.enabled, 1);
  assert.equal(r.body.automations.error, 'boom');
  await c2.close();
});
