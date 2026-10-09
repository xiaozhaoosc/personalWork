import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** 仓库根目录（server/ 的上一级） */
export const REPO_ROOT = join(__dirname, '..');

export interface ServerConfig {
  /** 自管的 SQLite 文件 */
  workbenchDbPath: string;
  /** WorkBuddy 用户目录（只读来源） */
  workbuddyUserDir: string;
  /** 头像磁盘缓存目录 */
  cacheDir: string;
  /** 0 表示由系统分配临时端口（测试用） */
  port: number;
  host: string;
  /** 显式指定的 WorkBuddy.exe；null 表示自动探测 */
  workbuddyExe: string | null;
  serveStatic: boolean;
  distDir: string;
  /** 专家头像 CDN base 覆盖项 */
  expertCdnBase: string | null;
}

/**
 * 解析端口。注意：0 是合法值（临时端口），只有 NaN / 非整数 / 越界才回落默认值。
 * 旧实现 `Number(x) || 3001` 会把 0 误判为空值，这里修正。
 */
export function parsePort(v: string | undefined, dflt = 3001): number {
  if (v === undefined || v.trim() === '') return dflt;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 65535 ? n : dflt;
}

/** 在调用时读取环境变量（不再用模块级 const，便于测试注入） */
export function loadConfig(over: Partial<ServerConfig> = {}): ServerConfig {
  return {
    workbenchDbPath: process.env.WORKBENCH_DB_PATH || join(REPO_ROOT, 'workbench.db'),
    workbuddyUserDir: process.env.WORKBUDDY_USER_DIR || join(homedir(), '.workbuddy'),
    cacheDir: process.env.CACHE_DIR || join(REPO_ROOT, '.cache'),
    port: parsePort(process.env.PORT),
    host: '127.0.0.1',
    workbuddyExe: process.env.WORKBUDDY_EXE || null,
    serveStatic: existsSync(join(REPO_ROOT, 'dist', 'index.html')),
    distDir: join(REPO_ROOT, 'dist'),
    expertCdnBase: process.env.WORKBUDDY_EXPERT_CDN_BASE || null,
    ...over,
  };
}
