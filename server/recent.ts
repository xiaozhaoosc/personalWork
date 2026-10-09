import type { DatabaseSync } from 'node:sqlite';

/** 记录最近查看的技能/专家（同一 kind+ref 覆盖并刷新时间） */
export function recordRecent(db: DatabaseSync, kind: string, refKey: string): void {
  db.prepare(
    'INSERT OR REPLACE INTO recent_items (kind,ref_key,last_opened_at) VALUES (?,?,?)'
  ).run(kind, refKey, Date.now());
}

/** 最近使用列表：回查显示名，最多 12 条 */
export function listRecent(db: DatabaseSync): unknown[] {
  return db
    .prepare(
      `SELECT r.kind, r.ref_key, r.last_opened_at,
              CASE r.kind
                WHEN 'skill' THEN (SELECT name FROM skills WHERE slug = r.ref_key)
                WHEN 'expert' THEN COALESCE((SELECT display_name_zh FROM experts WHERE id = r.ref_key),
                                            (SELECT display_name_en FROM experts WHERE id = r.ref_key))
              END AS name
       FROM recent_items r ORDER BY r.last_opened_at DESC LIMIT 12`
    )
    .all();
}
