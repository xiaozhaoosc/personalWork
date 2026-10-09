import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { openDb, runMigrations } from '../../server/db.ts';

const created: string[] = [];
let hooked = false;

function hookExit() {
  if (hooked) return;
  hooked = true;
  process.on('exit', () => {
    for (const dir of created.splice(0)) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        /* 尽力清理 */
      }
    }
  });
}

export interface TempDb {
  db: DatabaseSync;
  dir: string;
  file: string;
  cleanup(): void;
}

/**
 * 建立隔离的临时数据库（真实文件 + WAL，便于验证事务回滚）。
 * 绝不使用 :memory:，因为生产路径依赖 journal_mode=WAL。
 */
export function makeTempDb(): TempDb {
  hookExit();
  const dir = mkdtempSync(join(tmpdir(), 'wb-test-'));
  created.push(dir);
  const file = join(dir, 'test.db');
  const db = openDb(file);
  runMigrations(db);
  return {
    db,
    dir,
    file,
    cleanup() {
      try {
        db.close();
      } catch {
        /* 忽略 */
      }
      rmSync(dir, { recursive: true, force: true });
      const i = created.indexOf(dir);
      if (i !== -1) created.splice(i, 1);
    },
  };
}

/** 插入一行技能（测试便捷函数） */
export function insertSkill(db: DatabaseSync, row: Record<string, any>): void {
  db.prepare(
    `INSERT INTO skills (slug,name,file_path,description,description_zh,source,type,disabled,version,installed_at,marketplace_source,icon_url,examples_zh,skill_id,imported_at)
     VALUES (@slug,@name,@file_path,@description,@description_zh,@source,@type,@disabled,@version,@installed_at,@marketplace_source,@icon_url,@examples_zh,@skill_id,@imported_at)`
  ).run({
    file_path: null,
    description: null,
    description_zh: null,
    source: 'userSettings',
    type: 'prompt',
    disabled: 0,
    version: null,
    installed_at: null,
    marketplace_source: null,
    icon_url: null,
    examples_zh: null,
    skill_id: null,
    imported_at: Date.now(),
    ...row,
  });
}

/** 插入一行专家（测试便捷函数） */
export function insertExpert(db: DatabaseSync, row: Record<string, any>): void {
  db.prepare(
    `INSERT INTO experts (id,category_id,display_name_zh,display_name_en,profession_zh,profession_en,description_zh,description_en,
      prompt_file,avatar,created_at,updated_at,default_init_prompt_zh,default_init_prompt_en,
      expert_type,agent_name,plugin,tags_zh,tags_en,quick_prompts_zh,quick_prompts_en,is_opc,imported_at)
     VALUES (@id,@category_id,@display_name_zh,@display_name_en,@profession_zh,@profession_en,@description_zh,@description_en,
      @prompt_file,@avatar,@created_at,@updated_at,@default_init_prompt_zh,@default_init_prompt_en,
      @expert_type,@agent_name,@plugin,@tags_zh,@tags_en,@quick_prompts_zh,@quick_prompts_en,@is_opc,@imported_at)`
  ).run({
    category_id: null,
    display_name_zh: null,
    display_name_en: null,
    profession_zh: null,
    profession_en: null,
    description_zh: null,
    description_en: null,
    prompt_file: null,
    avatar: null,
    created_at: null,
    updated_at: null,
    default_init_prompt_zh: null,
    default_init_prompt_en: null,
    expert_type: null,
    agent_name: null,
    plugin: null,
    tags_zh: '[]',
    tags_en: '[]',
    quick_prompts_zh: '[]',
    quick_prompts_en: '[]',
    is_opc: 0,
    imported_at: Date.now(),
    ...row,
  });
}
