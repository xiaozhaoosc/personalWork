import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, type TestClient } from '../helpers/app.ts';

let c: TestClient;
const ids: Record<string, string> = {};

before(async () => {
  c = await startTestServer();
  // 显式指定 order_idx：同毫秒创建的记录 created_at 相同，排序结果不确定
  for (const [k, title, idx] of [
    ['a', '任务A', 0],
    ['b', '任务B', 1],
    ['d', '任务C', 2],
  ] as const) {
    const r = await c.send('POST', '/api/tasks', { title, status: 'todo', order_idx: idx });
    ids[k] = r.body.id;
  }
});
after(async () => {
  await c.close();
});

test('POST /api/tasks: 默认值与返回 201', async () => {
  const r = await c.send('POST', '/api/tasks', {});
  assert.equal(r.status, 201);
  assert.equal(r.body.title, '未命名任务');
  assert.equal(r.body.status, 'todo');
  assert.equal(r.body.due_date, null);
  assert.equal(r.body.tags, '[]'); // 存储为 JSON 字符串
  await c.send('DELETE', `/api/tasks/${r.body.id}`);
});

test('GET /api/tasks: 按 order_idx, created_at 排序', async () => {
  const r = await c.get('/api/tasks');
  assert.equal(r.body.length, 3);
  assert.deepEqual(
    r.body.map((t: any) => t.title),
    ['任务A', '任务B', '任务C']
  );
});

test('POST /api/tasks/reorder: 正常批量更新并返回全表', async () => {
  const r = await c.send('POST', '/api/tasks/reorder', {
    updates: [
      { id: ids.b, status: 'doing', order_idx: 0 },
      { id: ids.a, status: 'doing', order_idx: 1 },
    ],
  });
  assert.equal(r.status, 200);
  const b = r.body.find((t: any) => t.id === ids.b);
  const a = r.body.find((t: any) => t.id === ids.a);
  assert.equal(b.status, 'doing');
  assert.equal(b.order_idx, 0);
  assert.equal(a.order_idx, 1);
});

test('POST /api/tasks/reorder: 坏数据 → 500 JSON 且事务回滚（数据未被部分修改）', async () => {
  const before = await c.get('/api/tasks');
  const bad = await c.send('POST', '/api/tasks/reorder', {
    updates: [
      { id: ids.d, status: 'done', order_idx: 0 }, // 先成功的一条
      { id: ids.a, status: { not: 'a string' }, order_idx: 1 }, // 绑定失败
    ],
  });
  assert.equal(bad.status, 500);
  assert.ok(bad.body.error);

  const after = await c.get('/api/tasks');
  assert.deepEqual(
    after.body.map((t: any) => [t.id, t.status, t.order_idx]),
    before.body.map((t: any) => [t.id, t.status, t.order_idx]),
    'reorder 失败后数据必须与调用前完全一致'
  );
});

test('POST /api/tasks/reorder: updates 缺失时为空操作', async () => {
  const r = await c.send('POST', '/api/tasks/reorder', {});
  assert.equal(r.status, 200);
  assert.equal(r.body.length, 3);
});

test('PATCH /api/tasks/:id: 空 body 保留所有字段', async () => {
  await c.send('PATCH', `/api/tasks/${ids.a}`, {
    due_date: 1700000000000,
    project: 'P',
    notes: 'N',
    tags: ['t1'],
  });
  const before = (await c.get('/api/tasks')).body.find((t: any) => t.id === ids.a);
  const r = await c.send('PATCH', `/api/tasks/${ids.a}`, {});
  assert.equal(r.body.title, before.title);
  assert.equal(r.body.due_date, before.due_date);
  assert.equal(r.body.project, 'P');
  assert.equal(r.body.notes, 'N');
  assert.equal(r.body.tags, '["t1"]');
  assert.ok(r.body.updated_at >= before.updated_at);
});

test('PATCH /api/tasks/:id: 显式 null 清空、缺键不清空', async () => {
  const cleared = await c.send('PATCH', `/api/tasks/${ids.a}`, { due_date: null });
  assert.equal(cleared.body.due_date, null);
  assert.equal(cleared.body.project, 'P'); // 其他字段不受影响

  const untouched = await c.send('PATCH', `/api/tasks/${ids.a}`, { title: '改名' });
  assert.equal(untouched.body.due_date, null);
});

test('PATCH /api/tasks/:id: 空串与 null 语义不同', async () => {
  const empty = await c.send('PATCH', `/api/tasks/${ids.a}`, { notes: '' });
  assert.equal(empty.body.notes, '');
  const nulled = await c.send('PATCH', `/api/tasks/${ids.a}`, { notes: null });
  assert.equal(nulled.body.notes, null);
});

test('PATCH /api/tasks/:id: tags 数组序列化为 JSON', async () => {
  const r = await c.send('PATCH', `/api/tasks/${ids.a}`, { tags: ['a', 'b'] });
  assert.equal(r.body.tags, '["a","b"]');
});

test('PATCH /api/tasks/:id: 不存在 → 404', async () => {
  const r = await c.send('PATCH', '/api/tasks/nope', { title: 'x' });
  assert.equal(r.status, 404);
  assert.deepEqual(r.body, { error: 'not found' });
});

test('DELETE /api/tasks/:id: 删除并幂等', async () => {
  const created = await c.send('POST', '/api/tasks', { title: '待删' });
  assert.equal((await c.send('DELETE', `/api/tasks/${created.body.id}`)).body.ok, true);
  assert.equal((await c.send('DELETE', `/api/tasks/${created.body.id}`)).status, 200);
  assert.equal((await c.get('/api/tasks')).body.length, 3);
});
