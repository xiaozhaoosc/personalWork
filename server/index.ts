import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { loadEnvFile } from './env.ts';
import { loadConfig } from './config.ts';
import { openDb, runMigrations } from './db.ts';
import { createApp } from './app.ts';
import { importSkillsExperts } from './import.ts';
import { createWorkbuddyReader } from './workbuddy.ts';
import { createExpertAvatarProxy } from './expert-avatar.ts';

loadEnvFile();
const config = loadConfig();

const db = openDb(config.workbenchDbPath);
runMigrations(db);

// 首次启动若为空则自动导入
if ((db.prepare('SELECT COUNT(*) c FROM skills').get() as any).c === 0) {
  console.log('[import] 首次自动导入:', importSkillsExperts(db, config.workbuddyUserDir));
}

const reader = createWorkbuddyReader(config.workbuddyUserDir, {
  snapshotDir: join(config.cacheDir, 'workbuddy-snapshot'),
});

// 头像代理依赖 experts 表，故在导入之后再建（构造时会建立 id→URL 白名单）
const avatarProxy = createExpertAvatarProxy({
  db,
  userDir: config.workbuddyUserDir,
  cacheDir: config.cacheDir,
  cdnBaseOverride: config.expertCdnBase,
  isRemoteEnabled: () => {
    const row = db.prepare("SELECT value FROM app_prefs WHERE key='avatarsRemote'").get() as any;
    return !row || row.value !== '0';
  },
});

const app = createApp({
  db,
  getAutomations: () => reader.getAutomations(),
  importSkillsExperts: () => importSkillsExperts(db, config.workbuddyUserDir),
  serveStatic: config.serveStatic,
  distDir: config.distDir,
  workbuddyExe: config.workbuddyExe,
  avatarProxy,
});

// 仅在直接运行时监听端口；被测试或其他模块 import 时不绑定端口
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = app.listen(config.port, config.host, () => {
    const addr = server.address() as any;
    const port = addr && typeof addr === 'object' ? addr.port : config.port;
    console.log(`[server] 个人工作台 API 运行于 http://localhost:${port}`);
    console.log(`[server] WorkBuddy 用户目录: ${config.workbuddyUserDir}`);
    const d = avatarProxy.describe();
    console.log(`[server] 专家头像：${d.count} 条映射，CDN base = ${d.base ?? '(不可用，回退文字头像)'}`);
  });
}

export { app };
