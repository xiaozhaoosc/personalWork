import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runMigrations, splitStatements, MIGRATIONS_DIR } from '../../server/db.ts';
import { makeTempDb } from '../helpers/db.ts';

test('splitStatements: 按 statement-breakpoint 切分', () => {
  assert.deepEqual(splitStatements('A;\n--> statement-breakpoint\nB;'), ['A;', 'B;']);
  assert.deepEqual(splitStatements(''), []);
});

test('splitStatements: 基线迁移切分为 9 段，末段含 6 条 CREATE INDEX', () => {
  const sql = readFileSync(join(MIGRATIONS_DIR, '0000_workbench_baseline.sql'), 'utf8');
  const parts = splitStatements(sql);
  assert.equal(parts.length, 9);
  assert.ok(parts.every((p) => p.trim().length > 0));
  const last = parts[parts.length - 1];
  assert.equal(last.match(/CREATE INDEX/gi)?.length, 6);
});

test('runMigrations: 首次应用、再次调用幂等', (t) => {
  const tmp = makeTempDb();
  t.after(() => tmp.cleanup());
  // makeTempDb 已执行过一次迁移；再执行应返回空数组
  const applied = runMigrations(tmp.db);
  assert.deepEqual(applied, []);
});

test('runMigrations: 全部表与索引已建立', (t) => {
  const tmp = makeTempDb();
  t.after(() => tmp.cleanup());
  const tables = (
    tmp.db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table'`)
      .all() as any[]
  ).map((r) => r.name);
  for (const tname of [
    '_migrations',
    'skills',
    'expert_categories',
    'experts',
    'tasks',
    'automation_drafts',
    'recent_items',
    'app_prefs',
  ]) {
    assert.ok(tables.includes(tname), `缺少表 ${tname}`);
  }
  const idx = (
    tmp.db
      .prepare(`SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'`)
      .all() as any[]
  ).map((r) => r.name);
  assert.equal(idx.length, 6);
});
