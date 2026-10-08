import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { WORKBUDDY_USER_DIR } from './import.ts';

const wbDbPath = join(WORKBUDDY_USER_DIR, 'workbuddy.db');
let wbDb: DatabaseSync | null = null;

function getWbDb(): DatabaseSync | null {
  if (!existsSync(wbDbPath)) return null;
  if (!wbDb) {
    // 严格只读，绝不在本库写 WorkBuddy 运行时数据
    wbDb = new DatabaseSync(wbDbPath, { readonly: true });
  }
  return wbDb;
}

export function getAutomations(): { rows: any[]; error?: string } {
  const d = getWbDb();
  if (!d) return { rows: [], error: 'workbuddy.db 不存在' };
  try {
    const rows = d
      .prepare(
        'SELECT id,name,status,schedule_type,rrule,scheduled_at,skills_json,expert_id,connector_ids_json,created_at,updated_at FROM automations WHERE deleted_at IS NULL ORDER BY created_at DESC'
      )
      .all();
    return { rows };
  } catch (e) {
    return { rows: [], error: `读取 automations 失败（可能为结构变更）: ${(e as Error).message}` };
  }
}
