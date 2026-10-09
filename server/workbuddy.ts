import { DatabaseSync } from 'node:sqlite';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export interface AutomationsResult {
  rows: any[];
  error?: string;
  /** true 表示直接只读打开失败、改用本地快照读取 */
  viaSnapshot?: boolean;
}

export interface WorkbuddyReader {
  getAutomations(): AutomationsResult;
}

const AUTOMATIONS_SQL =
  'SELECT id,name,status,schedule_type,rrule,scheduled_at,skills_json,expert_id,connector_ids_json,created_at,updated_at FROM automations WHERE deleted_at IS NULL ORDER BY created_at DESC';

/**
 * 创建 WorkBuddy 运行时库的只读读取器。
 *
 * 为什么不缓存连接：WorkBuddy 运行中会做 WAL checkpoint（并可能重建 -shm），
 * 缓存的只读句柄会随之失效。
 *
 * 为什么需要快照回退：部分环境下（尤其是沙箱/受限进程）对 WorkBuddy 库的
 * **只读查询**会在读取 WAL 索引时失败（`unable to open database file`），
 * 而普通文件读取正常。此时退化为「热备份快照」：把 db + -wal 复制到我们自己的
 * 缓存目录再读取——全过程不写原始库，PRD 的「零写入 WorkBuddy 运行时数据」仍然成立。
 */
export function createWorkbuddyReader(
  userDir: string,
  opts: { snapshotDir?: string } = {}
): WorkbuddyReader {
  const wbDbPath = join(userDir, 'workbuddy.db');
  const snapshotDir = opts.snapshotDir;

  function queryAutomations(db: DatabaseSync): any[] {
    return db.prepare(AUTOMATIONS_SQL).all();
  }

  function readViaSnapshot(): AutomationsResult {
    if (!snapshotDir) {
      return { rows: [], error: '无法只读打开 workbuddy.db，且未配置快照目录' };
    }
    const snapDb = join(snapshotDir, 'workbuddy.db');
    try {
      mkdirSync(snapshotDir, { recursive: true });
      // 先主库后 WAL；对快照而言 SQLite 会自行重建 -shm 并恢复 WAL
      copyFileSync(wbDbPath, snapDb);
      if (existsSync(`${wbDbPath}-wal`)) {
        copyFileSync(`${wbDbPath}-wal`, `${snapDb}-wal`);
      }
      // 打开的是我们自己的副本，因此可以用读写模式让 SQLite 完成 WAL 恢复
      const snap = new DatabaseSync(snapDb);
      try {
        return { rows: queryAutomations(snap), viaSnapshot: true };
      } finally {
        try {
          snap.close();
        } catch {
          /* 忽略关闭异常 */
        }
      }
    } catch (e) {
      return { rows: [], error: `快照回退失败: ${(e as Error).message}` };
    }
  }

  function getAutomations(): AutomationsResult {
    if (!existsSync(wbDbPath)) return { rows: [], error: 'workbuddy.db 不存在' };

    let db: DatabaseSync | null = null;
    try {
      // 选项名必须是 readOnly（曾误写 readonly，导致只读实际未生效）
      db = new DatabaseSync(wbDbPath, { readOnly: true });
      return { rows: queryAutomations(db) };
    } catch (e) {
      const direct = (e as Error).message;
      try {
        db?.close();
      } catch {
        /* 忽略 */
      }
      const snap = readViaSnapshot();
      if (snap.error && !snap.rows.length) {
        return {
          rows: [],
          error: `直接只读打开失败(${direct})；${snap.error}`,
        };
      }
      return snap;
    } finally {
      try {
        db?.close();
      } catch {
        /* 忽略关闭异常 */
      }
    }
  }

  return { getAutomations };
}
