import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, type TestClient } from '../helpers/app.ts';

let c: TestClient;
let draftId: string;

before(async () => {
  c = await startTestServer();
});
after(async () => {
  await c.close();
});

test('POST /api/automation-drafts: 默认值', async () => {
  const r = await c.send('POST', '/api/automation-drafts', {});
  assert.equal(r.status, 201);
  assert.equal(r.body.name, '未命名草稿');
  assert.equal(r.body.status, 'draft');
  assert.equal(r.body.skills_json, '[]');
  assert.equal(r.body.connector_ids_json, '[]');
  draftId = r.body.id;
});

test('GET /api/automation-drafts: 存在且按 created_at DESC', async () => {
  const r = await c.get('/api/automation-drafts');
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body));
  assert.equal(r.body.length, 1);
});

test('GET /api/automation-drafts/:id/export: recurring 形态', async () => {
  await c.send('PATCH', `/api/automation-drafts/${draftId}`, {
    name: '每日资讯',
    prompt: '抓取 AI 热点',
    schedule_type: 'recurring',
    rrule: 'FREQ=DAILY;BYHOUR=9;BYMINUTE=0',
    skills: ['aihot'],
    cwds: '/a,/b',
  });
  const r = await c.get(`/api/automation-drafts/${draftId}/export`);
  assert.equal(r.status, 200);
  assert.equal(r.body.json.scheduleType, 'recurring');
  assert.equal(r.body.json.rrule, 'FREQ=DAILY;BYHOUR=9;BYMINUTE=0');
  assert.equal(r.body.json.status, 'PAUSED');
  assert.deepEqual(r.body.json.cwds, ['/a', '/b']);
  assert.ok(r.body.prompt.includes('每日资讯'));
  assert.ok(r.body.prompt.includes('aihot'));
  assert.ok(typeof r.body.note === 'string' && r.body.note.length > 0);
});

test('GET /api/automation-drafts/:id/export: once 形态', async () => {
  await c.send('PATCH', `/api/automation-drafts/${draftId}`, {
    schedule_type: 'once',
    scheduled_at: '2026-12-01T09:00',
    rrule: null,
  });
  const r = await c.get(`/api/automation-drafts/${draftId}/export`);
  assert.equal(r.body.json.scheduleType, 'once');
  assert.equal(r.body.json.scheduledAt, '2026-12-01T09:00');
  assert.equal('rrule' in r.body.json, false);
});

test('GET /api/automation-drafts/:id/export: 未知 id → 404', async () => {
  const r = await c.get('/api/automation-drafts/nope/export');
  assert.equal(r.status, 404);
  assert.deepEqual(r.body, { error: 'not found' });
});

test('PATCH /api/automation-drafts/:id: 回退语义与 404', async () => {
  const keep = await c.send('PATCH', `/api/automation-drafts/${draftId}`, { expert_id: 'E1' });
  assert.equal(keep.body.expert_id, 'E1');
  const keep2 = await c.send('PATCH', `/api/automation-drafts/${draftId}`, { name: '仅改名' });
  assert.equal(keep2.body.expert_id, 'E1'); // 未提供的字段保持不变
  const clear = await c.send('PATCH', `/api/automation-drafts/${draftId}`, { expert_id: null });
  assert.equal(clear.body.expert_id, null);
  assert.equal((await c.send('PATCH', '/api/automation-drafts/nope', { name: 'x' })).status, 404);
});

test('DELETE /api/automation-drafts/:id', async () => {
  assert.equal((await c.send('DELETE', `/api/automation-drafts/${draftId}`)).body.ok, true);
  assert.equal((await c.get('/api/automation-drafts')).body.length, 0);
});
