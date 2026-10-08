# 个人工作台 (Personal Workbench)

本地优先的 WorkBuddy 个人效率驾驶舱：集中管理已装技能、专家目录、个人待办与自动化编排。数据存于本地 SQLite，离线可用。

- 产品规格：`spec/PRD-个人工作台.md`
- 开源协议：Apache-2.0

## 技术栈

- 后端：Node.js + 内置 `node:sqlite`（零额外数据库依赖）+ Express
- 前端：React + Vite + TypeScript
- 数据库：本地单文件 `workbench.db`（自管）；WorkBuddy 的 `workbuddy.db` 仅**只读**镜像

## 目录结构

```
server/               后端（Express + node:sqlite）
  db.ts               连接 + 迁移器（沿用 WorkBuddy 的 statement-breakpoint 约定）
  migrations/         迁移 SQL（0000_workbench_baseline.sql）
  import.ts           从 WorkBuddy 缓存只读导入 技能/专家
  workbuddy.ts        workbuddy.db 只读镜像（自动化）
  index.ts            API 路由 + 静态托管
src/                 前端（React + Vite）
  pages/              Dashboard / Skills / Experts / Tasks / Automations / Settings
spec/PRD-个人工作台.md  产品需求文档
.env.example         环境变量模板（真实密钥请放 .env，已被忽略）
```

## 运行方式

```bash
npm install
npm run dev          # 开发模式：Vite(5173) + API(3001)，Vite 代理 /api
# 或生产模式：
npm run build        # 构建前端到 dist/
npm start            # 由 Express 同时托管 API 与前端（http://localhost:3001）
```

首次启动会自动从 WorkBuddy 缓存导入技能（57）/ 专家（448）/ 分类（15）。
也可在「设置」页点击「重新导入」手动刷新。

## 数据与安全

- 应用数据存于本地 `workbench.db`，**拷贝该文件即可完整备份/迁移**。
- 任何密钥（API Key、支付密钥等）只放 `.env`，该文件已被 `.gitignore` 忽略，**不会入库**。
- WorkBuddy 运行时库 `workbuddy.db` 仅以只读方式访问，绝不写回。
