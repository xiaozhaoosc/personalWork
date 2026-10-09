import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, type AppDeps } from '../../server/app.ts';
import { makeTempDb, type TempDb } from './db.ts';

export interface TestClient {
  get(path: string): Promise<{ status: number; body: any; headers: Headers }>;
  send(
    method: string,
    path: string,
    body?: any,
    rawBody?: string
  ): Promise<{ status: number; body: any; headers: Headers }>;
  close(): Promise<void>;
  db: TempDb['db'];
  /** 记录 spawn 调用，断言不会真的启动进程 */
  spawnCalls: { exe: string; args: string[]; options: any }[];
}

async function req(base: string, method: string, path: string, body?: any, rawBody?: string) {
  const init: RequestInit = { method };
  if (rawBody !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = rawBody;
  } else if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  const res = await fetch(base + path, init);
  const text = await res.text();
  let parsed: any = undefined;
  try {
    parsed = text ? JSON.parse(text) : undefined;
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed, headers: res.headers };
}

/**
 * 启动一个测试用服务器：临时库 + stub 依赖 + 注入的假 spawn。
 * 使用端口 0（临时端口），不会与真实服务冲突。
 */
export async function startTestServer(over: Partial<AppDeps> = {}): Promise<TestClient> {
  const tmp = makeTempDb();
  const spawnCalls: { exe: string; args: string[]; options: any }[] = [];

  const app = createApp({
    db: tmp.db,
    getAutomations: () => ({ rows: [] }),
    importSkillsExperts: () => ({ skills: 0, experts: 0, categories: 0, warnings: [] }),
    serveStatic: false,
    spawnFn: (exe, args, options) => {
      spawnCalls.push({ exe, args, options });
      return { pid: 424242, unref: () => {} };
    },
    ...over,
  });

  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = (server.address() as AddressInfo).port;
  const base = `http://127.0.0.1:${port}`;

  return {
    get: (path) => req(base, 'GET', path),
    send: (method, path, body, rawBody) => req(base, method, path, body, rawBody),
    db: tmp.db,
    spawnCalls,
    async close() {
      await new Promise<void>((r) => server.close(() => r()));
      tmp.cleanup();
      try {
        rmSync(join(tmp.dir), { recursive: true, force: true });
      } catch {
        /* 已清理 */
      }
    },
  };
}
