import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const LINE_RE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/;

/** 纯函数：解析 .env 文本 → 键值对。不读 process.env，不碰磁盘。 */
export function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(LINE_RE);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();
    // 未加引号时截断行尾注释；加引号则保留其中的 #
    if (!val.startsWith('"') && !val.startsWith("'")) {
      const hash = val.indexOf(' #');
      if (hash !== -1) val = val.slice(0, hash).trim();
    }
    if (
      (val.startsWith('"') && val.endsWith('"') && val.length >= 2) ||
      (val.startsWith("'") && val.endsWith("'") && val.length >= 2)
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

/** 把解析结果写入 target（不覆盖已存在的键），返回实际写入的键 */
export function applyEnv(text: string, target: NodeJS.ProcessEnv = process.env): string[] {
  const parsed = parseEnv(text);
  const written: string[] = [];
  for (const [k, v] of Object.entries(parsed)) {
    if (target[k] === undefined) {
      target[k] = v;
      written.push(k);
    }
  }
  return written;
}

/** 读取 .env 并应用；文件不存在或读取失败时静默返回 */
export function loadEnvFile(envPath?: string): string[] {
  const p =
    envPath ?? join(dirname(fileURLToPath(import.meta.url)), '..', '.env');
  if (!existsSync(p)) return [];
  try {
    return applyEnv(readFileSync(p, 'utf8'));
  } catch {
    return [];
  }
}
