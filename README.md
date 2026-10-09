# 个人工作台 (Personal Workbench)

本地优先的 WorkBuddy 个人效率驾驶舱：集中管理已装技能、专家目录、个人待办与自动化编排。数据存于本地 SQLite，离线可用。

- 产品规格：`spec/PRD-个人工作台.md`
- 开源协议：Apache-2.0

## 技术栈

- 后端：Node.js + 内置 `node:sqlite`（零额外数据库依赖）+ Express
- 前端：React + Vite + TypeScript
- 数据库：本地单文件 `workbench.db`（自管）；WorkBuddy 的 `workbuddy.db` 仅**只读**访问
- 测试：Node 内置 `node:test`（**零新增依赖**），当前 88 个用例

## 目录结构

```
server/
  index.ts            入口：加载 .env → 建库 → 迁移 → 首次导入 → createApp → 仅直接运行时监听
  app.ts              createApp(deps)：全部路由（依赖注入，不碰 DB/配置/端口，测试友好）
  config.ts           调用时读取环境变量（parsePort 正确支持 0=临时端口）
  db.ts               openDb / runMigrations / splitStatements（沿用 WorkBuddy statement-breakpoint 约定）
  env.ts              .env 解析（parseEnv 纯函数 + applyEnv + loadEnvFile）
  sqlite-util.ts      事务 / JSON 容错解析等小工具
  import.ts           从 WorkBuddy 缓存只读导入技能/专家（事务包裹）
  workbuddy.ts        workbuddy.db 只读镜像；受限环境下自动降级为热备份快照
  launch.ts           workbuddy:// 已验证路由、exe 探测、spawn 唤起
  expert-avatar.ts    专家头像 CDN 白名单代理 + 磁盘缓存
  migrations/         迁移 SQL（0000_workbench_baseline.sql）
src/
  pages/              Dashboard / Skills / Experts / Tasks / Automations / Settings
  components/         Avatar（头像+文字兜底）、Toast（轻提示）
  hooks/              useLaunch（唤起逻辑）
tests/                unit（5 个）+ api（5 个）+ helpers
spec/PRD-个人工作台.md  产品需求文档（含 OQ1/OQ2 核实结论）
.env.example          环境变量模板（真实密钥请放 .env，已被忽略）
```

## 运行方式

```bash
npm install
npm run dev          # 开发模式：Vite(5173) + API(3001)，Vite 代理 /api
# 或生产模式：
npm run build        # 构建前端到 dist/
npm start            # 由 Express 同时托管 API 与前端（http://localhost:3001）
```

首次启动会自动从 WorkBuddy 缓存导入技能/专家；也可在「设置」页点击「重新导入」。

## 测试

```bash
npm test          # node:test + node:sqlite，无需浏览器/网络
npm run typecheck # 同时检查 src、server、tests
```

测试用**依赖注入**而非改环境变量：`createApp({ db, getAutomations, importSkillsExperts, spawnFn, serveStatic })`，
因此测试既不会碰到真实 `workbuddy.db`，也**绝不会启动真实的 WorkBuddy 进程**（`spawnFn` 是记录器）。
覆盖重点：导出构建器、`reorder` 事务原子性、`PATCH` 的 `undefined`/`null` 语义差异、分页归一、错误 JSON、头像 URL 拼接与负缓存。

## 启动技能 / 专家（workbuddy://）

已核实（2026-10-09，详见 PRD §15）：WorkBuddy **没有**「启动指定技能」或「注入并自动发送 prompt」的协议入口与 CLI 参数。

- **专家**：服务端 `spawn WorkBuddy.exe "workbuddy://experts?expertId=<id>"`，可直达该专家（Electron `second-instance` 扫描 argv，不依赖注册表）。
- **技能**：无 per-skill 路由，改为打开 `workbuddy://skills?tab=installed` 并复制提示词。
- 提示词始终需要你粘贴发送；成功唤起且剪贴板可用时只显示 2.5 秒轻提示。
- 未检测到 `WorkBuddy.exe` 时自动回退为浏览器打开（设置页可查看探测结果）。

## 专家头像

头像图片**不在本地**（448 条记录在磁盘上一张都没有），需从 WorkBuddy 官方 CDN 拉取：

- 由本机后端代理并缓存到 `.cache/expert-avatars/`（7 天过期、上游 404 记 24 小时负缓存、总量上限 200MB）
- 只按专家 id 查白名单表，不接受任何用户提供的路径
- 任何不可用情况回退为「首字母 + 固定色相」文字头像
- **设置页可一键关闭远程拉取**，关闭后不发出任何网络请求

## 数据与安全

- 应用数据存于本地 `workbench.db`，**拷贝该文件即可完整备份/迁移**。
- 任何密钥（API Key、支付密钥等）只放 `.env`，该文件已被 `.gitignore` 忽略，**不会入库**。
- WorkBuddy 运行时库 `workbuddy.db` 仅以只读方式访问；在受限环境下会自动改读本机快照副本，**绝不写回**。
- `.cache/` 存放头像缓存与只读快照，可随时删除并自动重建。
- 要求 Node ≥ 22（使用内置 `node:sqlite`）。
