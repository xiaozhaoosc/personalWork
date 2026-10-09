import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync, readdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const MIGRATIONS_DIR = join(__dirname, 'migrations');

/** 打开（并初始化 PRAGMA）一个 SQLite 连接。不再使用模块级单例。 */
export function openDb(file: string): DatabaseSync {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  return db;
}

/**
 * 沿用 WorkBuddy 约定：NNNN_*.sql，语句间用 `--> statement-breakpoint` 分隔。
 * 刻意不额外按 `;` 拆分：末段包含多条 CREATE INDEX 属于真实边界情况，由测试钉住。
 */
export function splitStatements(sql: string): string[] {
  return sql
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function listMigrationFiles(dir: string = MIGRATIONS_DIR): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

/** 应用未执行的迁移，返回本次应用的 id 列表；重复调用返回 []（幂等） */
export function runMigrations(db: DatabaseSync, dir: string = MIGRATIONS_DIR): string[] {
  db.exec(
    'CREATE TABLE IF NOT EXISTS _migrations (id TEXT PRIMARY KEY, applied_at INTEGER NOT NULL);'
  );
  const applied: string[] = [];
  for (const file of listMigrationFiles(dir)) {
    const id = file.replace(/\.sql$/, '');
    const row = db.prepare('SELECT id FROM _migrations WHERE id = ?').get(id);
    if (row) continue;
    const sql = readFileSync(join(dir, file), 'utf8');
    for (const stmt of splitStatements(sql)) db.exec(stmt);
    db.prepare('INSERT INTO _migrations (id, applied_at) VALUES (?, ?)').run(id, Date.now());
    applied.push(id);
    console.log('[migrations] applied', id);
  }
  return applied;
}
