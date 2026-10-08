import './env.ts'; // 必须最先加载 .env，再创建数据库连接
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync, readdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const WORKBENCH_DB_PATH =
  process.env.WORKBENCH_DB_PATH || join(__dirname, '..', 'workbench.db');

export const db = new DatabaseSync(WORKBENCH_DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

/** 沿用 WorkBuddy 约定：NNNN_*.sql，语句间用 `--> statement-breakpoint` 分隔 */
export function runMigrations(): string[] {
  db.exec(
    'CREATE TABLE IF NOT EXISTS _migrations (id TEXT PRIMARY KEY, applied_at INTEGER NOT NULL);'
  );
  const dir = join(__dirname, 'migrations');
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  const applied: string[] = [];
  for (const file of files) {
    const id = file.replace(/\.sql$/, '');
    const row = db.prepare('SELECT id FROM _migrations WHERE id = ?').get(id);
    if (row) continue;
    const sql = readFileSync(join(dir, file), 'utf8');
    const statements = sql
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const stmt of statements) db.exec(stmt);
    db.prepare('INSERT INTO _migrations (id, applied_at) VALUES (?, ?)').run(
      id,
      Date.now()
    );
    applied.push(id);
    console.log('[migrations] applied', id);
  }
  return applied;
}
