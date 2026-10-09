import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readCdnBaseUrl, buildAvatarUrlMap, createExpertAvatarProxy } from '../../server/expert-avatar.ts';
import { makeTempDb, insertExpert } from '../helpers/db.ts';

function makeUserDir(meta?: any): string {
  const dir = mkdtempSync(join(tmpdir(), 'wb-avatar-'));
  if (meta !== undefined) {
    mkdirSync(join(dir, 'app', 'cache', 'experts'), { recursive: true });
    writeFileSync(join(dir, 'app', 'cache', 'experts', 'metadata.json'), JSON.stringify(meta));
  }
  return dir;
}

test('readCdnBaseUrl: env 覆盖优先且必须是 https', () => {
  assert.equal(
    readCdnBaseUrl('C:/nonexistent', 'https://cdn.example.com/base/'),
    'https://cdn.example.com/base'
  );
  assert.equal(readCdnBaseUrl('C:/nonexistent', 'http://insecure.example.com'), null);
});

test('readCdnBaseUrl: sourceSignature 为嵌套 JSON 字符串时需二次 parse', () => {
  const dir = makeUserDir({
    sourceSignature: JSON.stringify({ baseUrl: 'https://cdn.example.com/marketplace' }),
  });
  assert.equal(readCdnBaseUrl(dir, null), 'https://cdn.example.com/marketplace');
  rmSync(dir, { recursive: true, force: true });
});

test('readCdnBaseUrl: sourceSignature 已是对象时同样支持（形状漂移兜底）', () => {
  const dir = makeUserDir({ sourceSignature: { baseUrl: 'https://cdn.example.com/x' } });
  assert.equal(readCdnBaseUrl(dir, null), 'https://cdn.example.com/x');
  rmSync(dir, { recursive: true, force: true });
});

test('readCdnBaseUrl: 非法输入一律返回 null', () => {
  const cases: any[] = [
    undefined,
    {},
    { sourceSignature: 'not-json' },
    { sourceSignature: { baseUrl: 'http://insecure' } },
    { sourceSignature: { baseUrl: 123 } },
  ];
  for (const meta of cases) {
    const dir = makeUserDir(meta);
    assert.equal(readCdnBaseUrl(dir, null), null, JSON.stringify(meta));
    rmSync(dir, { recursive: true, force: true });
  }
  const empty = makeUserDir();
  assert.equal(readCdnBaseUrl(empty, null), null);
  rmSync(empty, { recursive: true, force: true });
});

test('buildAvatarUrlMap: 字符串拼接（不能用 new URL，否则丢 base 路径段）', (t) => {
  const tmp = makeTempDb();
  t.after(() => tmp.cleanup());
  const base = 'https://cdn.example.com/workbuddy/expert-marketplace';
  insertExpert(tmp.db, { id: 'E1', avatar: '/avatars/ContentCreator.png' });

  const map = buildAvatarUrlMap(tmp.db, base);
  assert.equal(map.get('E1'), `${base}/avatars/ContentCreator.png`);
  // 回归护栏：new URL() 形式会把前导 / 当作绝对路径，抹掉 base 的路径段
  const wrong = new URL('/avatars/ContentCreator.png', base).toString();
  assert.notEqual(map.get('E1'), wrong);
  assert.equal(wrong, 'https://cdn.example.com/avatars/ContentCreator.png');
});

test('buildAvatarUrlMap: 过滤穿越 / 非图片 / 绝对 URL；base 为 null 时为空', (t) => {
  const tmp = makeTempDb();
  t.after(() => tmp.cleanup());
  insertExpert(tmp.db, { id: 'bad1', avatar: '/avatars/../../secret.png' });
  insertExpert(tmp.db, { id: 'bad2', avatar: '/avatars/evil.svg' });
  insertExpert(tmp.db, { id: 'bad3', avatar: 'https://evil.example.com/a.png' });
  insertExpert(tmp.db, { id: 'ok', avatar: '/plugins/foo/avatars/team.jpg' });

  const map = buildAvatarUrlMap(tmp.db, 'https://cdn.example.com/b');
  assert.equal(map.has('bad1'), false);
  assert.equal(map.has('bad2'), false);
  assert.equal(map.has('bad3'), false);
  assert.equal(map.has('ok'), true);
  assert.equal(buildAvatarUrlMap(tmp.db, null).size, 0);
});

test('代理: 开关关闭时不发任何请求', async (t) => {
  const tmp = makeTempDb();
  const cacheDir = mkdtempSync(join(tmpdir(), 'wb-cache-'));
  t.after(() => {
    tmp.cleanup();
    rmSync(cacheDir, { recursive: true, force: true });
  });
  insertExpert(tmp.db, { id: 'E1', avatar: '/avatars/A.png' });

  let called = 0;
  const proxy = createExpertAvatarProxy({
    db: tmp.db,
    userDir: 'C:/nonexistent',
    cacheDir,
    cdnBaseOverride: 'https://cdn.example.com/b',
    isRemoteEnabled: () => false,
    fetchImpl: async () => {
      called++;
      return new Response(null, { status: 200 });
    },
  });
  const res = await invokeHandle(proxy, 'E1');
  assert.equal(res.status, 404);
  assert.equal(called, 0);
});

test('代理: 上游 404 → 404 + 负缓存（24h 内不再回源）', async (t) => {
  const tmp = makeTempDb();
  const cacheDir = mkdtempSync(join(tmpdir(), 'wb-cache-'));
  t.after(() => {
    tmp.cleanup();
    rmSync(cacheDir, { recursive: true, force: true });
  });
  insertExpert(tmp.db, { id: 'E1', avatar: '/plugins/gstack/avatars/team.png' });

  let called = 0;
  const proxy = createExpertAvatarProxy({
    db: tmp.db,
    userDir: 'C:/nonexistent',
    cacheDir,
    cdnBaseOverride: 'https://cdn.example.com/b',
    isRemoteEnabled: () => true,
    fetchImpl: async () => {
      called++;
      return new Response(null, { status: 404 });
    },
  });

  const first = await invokeHandle(proxy, 'E1');
  assert.equal(first.status, 404);
  const second = await invokeHandle(proxy, 'E1');
  assert.equal(second.status, 404);
  assert.equal(called, 1, '负缓存生效，第二次不应再回源');
});

test('代理: 上游 200 → 200 且第二次命中磁盘缓存', async (t) => {
  const tmp = makeTempDb();
  const cacheDir = mkdtempSync(join(tmpdir(), 'wb-cache-'));
  t.after(() => {
    tmp.cleanup();
    rmSync(cacheDir, { recursive: true, force: true });
  });
  insertExpert(tmp.db, { id: 'E1', avatar: '/avatars/A.png' });

  let called = 0;
  const proxy = createExpertAvatarProxy({
    db: tmp.db,
    userDir: 'C:/nonexistent',
    cacheDir,
    cdnBaseOverride: 'https://cdn.example.com/b',
    isRemoteEnabled: () => true,
    fetchImpl: async () => {
      called++;
      return new Response(Buffer.from([137, 80, 78, 71]), {
        status: 200,
        headers: { 'content-type': 'image/png' },
      });
    },
  });

  const miss = await invokeHandle(proxy, 'E1');
  assert.equal(miss.status, 200);
  assert.equal(miss.headers.get('x-cache'), 'miss');
  const hit = await invokeHandle(proxy, 'E1');
  assert.equal(hit.status, 200);
  assert.equal(hit.headers.get('x-cache'), 'hit');
  assert.equal(called, 1);
});

test('代理: 非图片 Content-Type 一律拒绝（防止把 CDN 错误页缓存成图片）', async (t) => {
  const tmp = makeTempDb();
  const cacheDir = mkdtempSync(join(tmpdir(), 'wb-cache-'));
  t.after(() => {
    tmp.cleanup();
    rmSync(cacheDir, { recursive: true, force: true });
  });
  insertExpert(tmp.db, { id: 'E1', avatar: '/avatars/A.png' });
  const proxy = createExpertAvatarProxy({
    db: tmp.db,
    userDir: 'C:/nonexistent',
    cacheDir,
    cdnBaseOverride: 'https://cdn.example.com/b',
    isRemoteEnabled: () => true,
    fetchImpl: async () =>
      new Response('<html>err</html>', { status: 200, headers: { 'content-type': 'text/html' } }),
  });
  const res = await invokeHandle(proxy, 'E1');
  assert.equal(res.status, 502);
});

test('代理: 未在白名单中的 id → 404 且不触网', async (t) => {
  const tmp = makeTempDb();
  const cacheDir = mkdtempSync(join(tmpdir(), 'wb-cache-'));
  t.after(() => {
    tmp.cleanup();
    rmSync(cacheDir, { recursive: true, force: true });
  });
  let called = 0;
  const proxy = createExpertAvatarProxy({
    db: tmp.db,
    userDir: 'C:/nonexistent',
    cacheDir,
    cdnBaseOverride: 'https://cdn.example.com/b',
    isRemoteEnabled: () => true,
    fetchImpl: async () => {
      called++;
      return new Response(null, { status: 200 });
    },
  });
  const res = await invokeHandle(proxy, 'NOT_EXIST');
  assert.equal(res.status, 404);
  assert.equal(called, 0);
});

/** 用最小 req/res 适配器驱动 proxy.handle，读取状态码与响应头 */
async function invokeHandle(
  proxy: { handle(req: any, res: any): Promise<void> },
  id: string
): Promise<{ status: number; headers: Map<string, string>; body: any }> {
  const headers = new Map<string, string>();
  let status = 0;
  let body: any;
  const res: any = {
    setHeader(k: string, v: string) {
      headers.set(k.toLowerCase(), v);
    },
    status(code: number) {
      status = code;
      return res;
    },
    json(obj: any) {
      body = obj;
      return res;
    },
    end(buf?: any) {
      body = buf;
      return res;
    },
  };
  await proxy.handle({ params: { id } }, res);
  return { status, headers, body };
}
