import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, type TestClient } from '../helpers/app.ts';
import { insertExpert } from '../helpers/db.ts';

let c: TestClient;
before(async () => {
  c = await startTestServer();
  c.db
    .prepare(
      `INSERT INTO expert_categories (id,name_zh,name_en,description_zh,description_en)
       VALUES (?,?,?,?,?)`
    )
    .run('01-ProductDesign', '产品设计', 'Product Design', '产品类', 'product');
  insertExpert(c.db, {
    id: 'E1',
    category_id: '01-ProductDesign',
    display_name_zh: '像素君',
    display_name_en: 'Pixel',
    profession_zh: 'UI设计师',
    description_zh: '做界面',
    agent_name: 'sam',
    tags_zh: JSON.stringify(['设计', 'UI']),
    is_opc: 1,
  });
  insertExpert(c.db, {
    id: 'E2',
    category_id: '01-ProductDesign',
    display_name_zh: '文博凯',
    profession_zh: '内容创作专家',
    tags_zh: JSON.stringify(['内容']),
  });
  insertExpert(c.db, { id: 'E3', category_id: '02-Engineering', display_name_zh: '吴八哥' });
});
after(async () => {
  await c.close();
});

test('GET /api/experts: query 跨 5 个字段做 OR', async () => {
  assert.equal((await c.get('/api/experts?query=像素')).body.total, 1); // display_name_zh
  assert.equal((await c.get('/api/experts?query=Pixel')).body.total, 1); // display_name_en
  assert.equal((await c.get('/api/experts?query=UI设计师')).body.total, 1); // profession_zh
  assert.equal((await c.get('/api/experts?query=做界面')).body.total, 1); // description_zh
  assert.equal((await c.get('/api/experts?query=sam')).body.total, 1); // agent_name
});

test('GET /api/experts: categoryId 与 isOpc 可组合', async () => {
  assert.equal((await c.get('/api/experts?categoryId=01-ProductDesign')).body.total, 2);
  assert.equal((await c.get('/api/experts?isOpc=1')).body.total, 1);
  assert.equal((await c.get('/api/experts?categoryId=01-ProductDesign&isOpc=1')).body.total, 1);
});

test('GET /api/experts: tag 需匹配带引号的 JSON 元素', async () => {
  assert.equal((await c.get('/api/experts?tag=设计')).body.total, 1);
  assert.equal((await c.get('/api/experts?tag=内容')).body.total, 1);
  assert.equal((await c.get('/api/experts?tag=不存在')).body.total, 0);
});

test('GET /api/expert-categories: 带出每位专家计数', async () => {
  const r = await c.get('/api/expert-categories');
  assert.equal(r.body.length, 1);
  assert.equal(r.body[0].count, 2);
});

test('GET /api/experts: 分页', async () => {
  const p1 = await c.get('/api/experts?pageSize=2&page=1');
  assert.equal(p1.body.rows.length, 2);
  assert.equal(p1.body.total, 3);
  assert.equal((await c.get('/api/experts?pageSize=2&page=2')).body.rows.length, 1);
});

test('GET /api/experts/:id: 200 / 404', async () => {
  assert.equal((await c.get('/api/experts/E1')).status, 200);
  const miss = await c.get('/api/experts/NOPE');
  assert.equal(miss.status, 404);
  assert.deepEqual(miss.body, { error: 'not found' });
});
