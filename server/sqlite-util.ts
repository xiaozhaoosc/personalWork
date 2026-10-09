import type { DatabaseSync } from 'node:sqlite';

export function asInt(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** 事务包裹：任何异常都整体 ROLLBACK，保证旧数据不被破坏 */
export function withTransaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

/** 容错解析 JSON 数组：null/空/非法 JSON/非数组 一律返回 [] */
export function safeJsonArray(json?: string | null): string[] {
  try {
    const v = json ? JSON.parse(json) : [];
    return Array.isArray(v) ? v : [];
  } catch {
    return []
  }
}

/** 按中英文逗号/分号切分并去空 */
export function splitCsv(v?: string | null): string[] {
  return (v || '')
    .split(/[,;，；]/)
    .map((s) => s.trim())
    .filter(Boolean);
}
