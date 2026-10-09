import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, type TestClient } from '../helpers/app.ts';
import { insertSkill } from '../helpers/db.ts';

let c: TestClient;
before(async () => {
  c = await startTestServer();
  insertSkill(c.db, { slug: 'alpha', name: 'Alpha', source: 'userSettings', disabled: 0, description_zh: '第一个技能' });
  insertSkill(c.db, { slug: 'beta', name: 'Beta', source: 'builtin', disabled: 1, description_zh: '第二个技能' });
  insertSkill(c.db, { slug: 'gamma', name: 'Gamma', source: 'builtin', disabled: 0 });
  insertSkill(c.db, { slug: 'delta', name: 'Delta', source: 'plugin', disabled: 1 });
});
after(async () => {
  await c.close();
});

test('GET /api/skills: 多条件为 AND 组合', async () => {
  const r = await c.get('/api/skills?source=builtin&disabled=1');
  assert.equal(r.status, 200);
  assert.equal(r.body.total, 1);
  assert.equal(r.body.rows[0].slug, 'beta');
});

test('GET /api/skills: query 命中 name / description_zh / slug', async () => {
  assert.equal((await c.get('/api/skills?query=Alpha')).body.total, 1);
  assert.equal((await c.get('/api/skills?query=%E7%AC%AC%E4%BA%8C')).body.total, 1); // "第二"
  assert.equal((await c.get('/api/skills?query=gamma')).body.total, 1);
  assert.equal((await c.get('/api/skills?query=nothing')).body.total, 0);
});

test('GET /api/skills: LIKE 通配符被参数化（不作为 SQL 语法）', async () => {
  const r = await c.get('/api/skills?query=%25');
  assert.equal(r.status, 200);
  assert.equal(r.body.total, 4); // '%' 作为字面量匹配全部
});

test('GET /api/skills: page 归一为 1', async () => {
  for (const q of ['page=0', 'page=-1', 'page=abc', '']) {
    const r = await c.get('/api/skills?' + q);
    assert.equal(r.body.page, 1, `query=${q}`);
  }
});

test('GET /api/skills: pageSize 归一（按当前真实行为钉住）', async () => {
  assert.equal((await c.get('/api/skills')).body.pageSize, 50);
  assert.equal((await c.get('/api/skills?pageSize=0')).body.pageSize, 50); // 0 被 || 吞掉 → 50
  assert.equal((await c.get('/api/skills?pageSize=-1')).body.pageSize, 1);
  assert.equal((await c.get('/api/skills?pageSize=abc')).body.pageSize, 50);
  assert.equal((await c.get('/api/skills?pageSize=9999')).body.pageSize, 200);
});

test('GET /api/skills: 分页切片正确且 total 不随分页变化', async () => {
  const p1 = await c.get('/api/skills?pageSize=2&page=1');
  const p2 = await c.get('/api/skills?pageSize=2&page=2');
  assert.equal(p1.body.rows.length, 2);
  assert.equal(p2.body.rows.length, 2);
  assert.equal(p1.body.total, 4);
  assert.equal(p2.body.total, 4);
  assert.notEqual(p1.body.rows[0].slug, p2.body.rows[0].slug);
});

test('GET /api/skills/:slug: 命中 200，未命中 404（JSON）', async () => {
  assert.equal((await c.get('/api/skills/alpha')).status, 200);
  const miss = await c.get('/api/skills/nope');
  assert.equal(miss.status, 404);
  assert.deepEqual(miss.body, { error: 'not found' });
});

test('GET /api/skills: disabled 仅识别 0/1，其他值被忽略', async () => {
  const all = await c.get('/api/skills');
  const weird = await c.get('/api/skills?disabled=2');
  assert.equal(weird.body.total, all.body.total);
});
