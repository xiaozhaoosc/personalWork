import { db } from './db.ts';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const WORKBUDDY_USER_DIR =
  process.env.WORKBUDDY_USER_DIR || join(homedir(), '.workbuddy');

function asInt(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** 事务包裹：任何一条失败即整体 ROLLBACK，保证旧数据不被破坏（PRD：导入失败不破坏旧数据） */
function withTransaction<T>(fn: () => T): T {
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

export function importSkillsExperts(): {
  skills: number;
  experts: number;
  categories: number;
  warnings: string[];
} {
  const warnings: string[] = [];
  let skillCount = 0;
  let expertCount = 0;
  let categoryCount = 0;

  // ---- 技能 ----
  const skillCache = join(WORKBUDDY_USER_DIR, '.skill-list-cache.json');
  if (existsSync(skillCache)) {
    try {
      const data = JSON.parse(readFileSync(skillCache, 'utf8'));
      const results: any[] = data.results || [];
      withTransaction(() => {
        db.exec('DELETE FROM skills;');
        const ins = db.prepare(
          `INSERT INTO skills
           (slug,name,file_path,description,description_zh,source,type,disabled,version,installed_at,marketplace_source,icon_url,examples_zh,skill_id,imported_at)
           VALUES (@slug,@name,@file_path,@description,@description_zh,@source,@type,@disabled,@version,@installed_at,@marketplace_source,@icon_url,@examples_zh,@skill_id,@imported_at)`
        );
        for (const s of results) {
          ins.run({
            slug: s.slug || s.skillId || s.name,
            name: s.name || '',
            file_path: s.filePath || null,
            description: s.description || null,
            description_zh: s.description_zh || null,
            source: s.source || null,
            type: s.type || null,
            disabled: s.disable ? 1 : 0,
            version: s.version || null,
            installed_at: asInt(s.installedAt),
            marketplace_source: s.marketplaceSource || null,
            icon_url: s.iconUrl || null,
            examples_zh: s.examples_zh ? JSON.stringify(s.examples_zh) : null,
            skill_id: s.skillId || null,
            imported_at: Date.now(),
          });
        }
        skillCount = results.length;
      });
    } catch (e) {
      warnings.push(`技能导入失败: ${(e as Error).message}`);
    }
  } else {
    warnings.push(`未找到技能缓存: ${skillCache}`);
  }

  // ---- 专家 ----
  const manifest = join(WORKBUDDY_USER_DIR, 'app', 'cache', 'experts', 'manifest.json');
  if (existsSync(manifest)) {
    try {
      const data = JSON.parse(readFileSync(manifest, 'utf8'));
      const categories: any[] = data.categories || [];
      const experts: any[] = data.experts || [];

      withTransaction(() => {
        db.exec('DELETE FROM expert_categories; DELETE FROM experts;');
        const insCat = db.prepare(
          `INSERT INTO expert_categories (id,name_zh,name_en,description_zh,description_en)
           VALUES (@id,@name_zh,@name_en,@description_zh,@description_en)`
        );
        for (const c of categories) {
          const name = c.name || {};
          const desc = c.description || {};
          insCat.run({
            id: c.id,
            name_zh: name.zh || null,
            name_en: name.en || null,
            description_zh: typeof desc === 'string' ? desc : desc?.zh || null,
            description_en: typeof desc === 'string' ? desc : desc?.en || null,
          });
        }

        const insExp = db.prepare(
          `INSERT INTO experts
           (id,category_id,display_name_zh,display_name_en,profession_zh,profession_en,description_zh,description_en,
            prompt_file,avatar,created_at,updated_at,default_init_prompt_zh,default_init_prompt_en,
            expert_type,agent_name,plugin,tags_zh,tags_en,quick_prompts_zh,quick_prompts_en,is_opc,imported_at)
           VALUES (@id,@category_id,@display_name_zh,@display_name_en,@profession_zh,@profession_en,@description_zh,@description_en,
            @prompt_file,@avatar,@created_at,@updated_at,@default_init_prompt_zh,@default_init_prompt_en,
            @expert_type,@agent_name,@plugin,@tags_zh,@tags_en,@quick_prompts_zh,@quick_prompts_en,@is_opc,@imported_at)`
        );
        for (const e of experts) {
          const dn = e.displayName || {};
          const pr = e.profession || {};
          const de = e.description || {};
          const dip = e.defaultInitPrompt || {};
          const tags = e.tags || [];
          const qp = e.quickPrompts || [];
          insExp.run({
            id: e.id,
            category_id: e.categoryId || null,
            display_name_zh: dn.zh || null,
            display_name_en: dn.en || null,
            profession_zh: pr.zh || null,
            profession_en: pr.en || null,
            description_zh: de.zh || null,
            description_en: de.en || null,
            prompt_file: e.promptFile || null,
            avatar: e.avatar || null,
            created_at: e.createdAt || null,
            updated_at: e.updatedAt || null,
            default_init_prompt_zh: dip.zh || null,
            default_init_prompt_en: dip.en || null,
            expert_type: e.expertType || null,
            agent_name: e.agentName || null,
            plugin: e.plugin || null,
            tags_zh: JSON.stringify(tags.map((t: any) => t?.zh ?? t)),
            tags_en: JSON.stringify(tags.map((t: any) => t?.en ?? t)),
            quick_prompts_zh: JSON.stringify(qp.map((t: any) => t?.zh ?? t)),
            quick_prompts_en: JSON.stringify(qp.map((t: any) => t?.en ?? t)),
            is_opc: e.isOPC ? 1 : 0,
            imported_at: Date.now(),
          });
        }
        categoryCount = categories.length;
        expertCount = experts.length;
      });
    } catch (e) {
      warnings.push(`专家导入失败: ${(e as Error).message}`);
    }
  } else {
    warnings.push(`未找到专家清单: ${manifest}`);
  }

  return { skills: skillCount, experts: expertCount, categories: categoryCount, warnings };
}

// 直接 `tsx server/import.ts` 时可独立运行（Windows 下 pathToFileURL 才能正确比较）
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = importSkillsExperts();
  console.log('导入完成:', r);
}
