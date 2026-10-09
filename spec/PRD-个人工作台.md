# 个人工作台 (Personal Workbench) — 产品需求文档 / PRD

| 项 | 内容 |
| --- | --- |
| 版本 | v1.1（优化稿） |
| 日期 | 2026-10-08 |
| 状态 | 设计稿——本回合只产出规格文档，应用代码在**后续回合**构建（用户已确认） |
| 定位 | local-first 的 WorkBuddy 个人效率驾驶舱。不重写 WorkBuddy 引擎，只做「浏览 / 编排 / 个人任务」层 |
| 数据持久化 | 本地 SQLite 单文件（用户已确认）。注：用户原话 "sqlline" 理解为 **SQLite**——WorkBuddy 自身已用 SQLite（`workbuddy.db`、`edge-sync-mapping-*.db` 及 `.workbuddy-sqlite-migrations` 编号迁移），是生态内最契合的选择 |


---

## 1. 背景与目的

为 WorkBuddy 重度用户提供一个本地、离线可用的统一仪表盘，集中管理已装技能、专家目录、个人待办、自动化编排与知识沉淀。

**目标**

- **G1 可视化真实库存**：57 技能 + 448 专家（15 分类）一站式浏览 / 搜索 / 筛选。
- **G2 个人生产力**：待办/任务、看板、自动化编排视图。
- **G3 零摩擦启动**：从工作台一键唤起技能或开启专家对话（deep-link），不复制引擎。
- **G4 本地优先、可备份**：单文件 SQLite，拷贝即备份。

**非目标**：不在本工具内运行 LLM/Agent；不托管到云；不替代 WorkBuddy 会话/执行引擎；不写回 WorkBuddy 运行时库。

---

## 2. 库存盘点（真实数据，已核对）

### 2.1 技能：57 个（user-installed 36 / builtin 19 / plugin 2）

- 文档处理：tencent-docx, tencent-pptx, tencent-docs, tencent-docs-sheet-generation, tencent-docs-sheetagent, tencent-local-office-edit, tencent-saas-docs, pdf, pdfkit-py, html-to-docx, doc-typeset
- 设计：ardot-*（design-core/design-to-code/poster/slides/ui-design）、miora-*（brand-design/creative-core/image-generation/video-generation）、design-router、design-token
- 金融：workbuddy-finance-skill（优先入口）、westock-data、westock-tool、neodata-financial-search
- 微信支付：weixinpay-register、weixinpay-pay、weixinpay-feedback
- 知识库：library、obsidian、obsidian-organize
- 浏览器/自动化：agent-browser、playwright-cli
- 技能&专家管理：skill-creator、find-skills、marketplace-skill-installer、expert-manager、recommend-experts、recommend-connectors
- 发布/部署：sites（发布为应用）、wechat-publisher、one-article-many-platforms（一稿多发）
- 其他：cloud-service（云服务）、geo-map-compliance-guard（合规）、aihot（AI资讯）、sanitized-project-backup（备份）
- 记录字段：`name, filePath, description, description_zh, source(userSettings|builtin|plugin), type(prompt), disable, slug, version, installedAt, marketplaceSource, iconUrl, examples_zh, skillId`
- 源缓存文件：`<wb>/.skill-list-cache.json` → `{"version":6,"results":[...]}`

### 2.2 专家：448 位 / 15 分类

内容创作(48) · 技术工程(45) · 数据智能(44) · 金融投资(39) · 营销增长(37) · 腾讯专区(37) · 行业顾问(35) · 法务安全(27) · 项目质量(25) · 游戏空间(25) · 全球发展(21) · 产品设计(20) · 销售商务(17) · 运营人力(17) · 开学季(11)。其中 135 个标记 `isOPC`。

- 记录字段：`id, categoryId, displayName{zh,en}, profession{zh,en}, description{zh,en}, promptFile, avatar, createdAt, updatedAt, defaultInitPrompt{zh,en}, expertType, agentName, plugin, tags[{zh,en}], quickPrompts[{zh,en}], isOPC`
- 源缓存文件：`<wb>/app/cache/experts/manifest.json`（1.2MB）→ `{version, lastUpdated, author, paths, categories:[{id,name:{en,zh},description}], experts:[...]}`
- 已缓存专家包模板：`plugins/cache/experts/workspace-builder/1.4.0`（未启用，可作构建灵感）

---

## 3. 范围

**In Scope**：总览仪表盘、技能中心、专家目录、任务/待办、自动化管理（只读镜像 + 编排草稿）、设置/数据导入/备份。技能与专家从 WorkBuddy 缓存**只读导入**；自动化从 `workbuddy.db` **只读镜像**。

**Out of Scope（本回合/近期）**：笔记/知识库模块（P2 可选）；任何写回 `workbuddy.db` 的行为；云端同步、多设备、协作。

**MVP vs 后续**

| 模块 | 优先级 | 阶段 |
| --- | --- | --- |
| 总览仪表盘 | P0 | MVP |
| 技能中心（浏览/搜索/筛选/详情） | P0 | MVP |
| 专家目录（浏览/搜索/筛选/详情） | P0 | MVP |
| 设置 / 数据导入 / 备份 | P0 | MVP |
| 任务/待办（列表+看板） | P1 | MVP |
| 自动化管理（只读查看） | P1 | MVP |
| 启动技能/专家 deep-link | P1 | MVP |
| 自动化编排草稿（编辑） | P2 | 后续 |
| 笔记/知识库 | P2 | 后续 |


---

## 4. 用户画像

- **P1 超级用户/效率控**：装几十技能、订阅数百专家，需统一检索与快速启动。
- **P2 内容/运营多面手**：频繁切换文档/PPT/发布/一稿多发，需任务看板与自动化编排。
- **P3 金融/研究型**：依赖金融技能组与专家，需按分类/标签精准定位并保存启动提示。

---

## 5. 功能模块规格

### 5.1 总览仪表盘 Home（P0）

- 聚合统计卡：技能数（按 source 拆分）、专家数（按分类）、待办数（按状态）、自动化数（启用/暂停）。
- 快捷操作：全局搜索框（跳技能/专家）、新建任务、新建自动化、重新导入数据。
- 最近使用：最近查看的技能/专家（本地 `recent_items` 记录，非 WorkBuddy 历史）。
- **验收**：首屏 < 500ms；统计数与导入数据一致。

### 5.2 技能中心 Skill Center（P0）

- 列表/卡片视图；搜索（name/description_zh/slug）；筛选：`source`、`type`、`disable`、`marketplaceSource`。
- 详情页：描述(zh/en)、示例(examples_zh)、filePath、版本、安装时间、来源市场；「启动技能」按钮。
- **验收**：57 条全部可检索；筛选组合正确。

### 5.3 专家目录 Expert Directory（P0）

- 分类侧栏（15 类，带计数）；搜索（displayName/profession/description/agentName）；筛选：`categoryId`、`tags`、`isOPC`、`expertType`。
- 详情页：中英职业/描述、头像、默认初始化提示、快捷提示、所属 plugin/agentName；「开启专家对话」按钮。
- **头像（双态，2026-10-09 核实后落地，见 §15）**：头像图片**不在本地**（448 条记录磁盘上 0 张），经后端白名单代理远程 CDN 并缓存；任何不可用情况回退为「首字母 + 固定色相」文字头像（`expertType=team` 用圆角方形，其余圆形）。设置页可一键关闭远程拉取，关闭后零网络请求。
- **验收**：448 条全部可检索；分类计数与盘点一致；头像在可用时显示图片、不用时显示文字头像且无破图。

### 5.4 任务/待办 Tasks（P1）

- 字段：`id, title, status(todo|doing|done), due_date, project, tags[], notes, order_idx, created_at, updated_at`。
- 列表 + 看板（按 status 拖拽）。工作台自有表，不与 WorkBuddy 耦合。
- **验收**：增删改查、拖拽换状态、按到期日排序均可用。

### 5.5 自动化管理 Automations（P1 查看 / P2 编辑）

- **查看**：以 `mode=ro` 只读打开 WorkBuddy `workbuddy.db`，`SELECT` 自 `automations` 表（字段已核对：name, prompt, status, schedule_type, rrule, scheduled_at, skills_json, expert_id, connector_ids_json, cwds, model_id, created_at, updated_at, deleted_at）。
- **编排草稿**：自有 `automation_drafts` 表（同形状）规划；真正创建仍交给 WorkBuddy 引擎（见 §9.3）。
- **验收**：能列出 WorkBuddy 现有自动化；rrule 人类可读展示；对 workbuddy.db 零写入。

### 5.6 设置 / 数据管理 Settings（P0）

- 数据来源路径配置（默认指向 WorkBuddy 用户目录）；「重新导入」（全量 upsert 技能/专家）+「刷新自动化镜像」。
- 备份/恢复：导出/拷贝 `workbench.db`；未来云路径占位。
- **验收**：重新导入幂等（重复执行不产生重复数据）；备份文件可恢复。

### 5.7 笔记/知识库 Notes（P2，可选）

- 轻量 Markdown 笔记，本地表；可关联技能/专家链接。

---

## 6. 信息架构

```
/                    总览
/skills              技能中心（列表）
/skills/:slug        技能详情
/experts             专家目录（分类+搜索）
/experts/:id         专家详情
/tasks               任务（列表/看板切换）
/automations         自动化（查看+草稿）
/settings            设置 / 数据导入 / 备份
/notes  (P2)         笔记
```

**UI/UX 原则**：中文优先（中英双语数据保留切换能力）；浅色主题为默认；左侧固定导航 + 右侧内容区；列表页均带搜索框与筛选器；详情页用侧滑抽屉或独立路由；空状态给出引导（如「数据未导入，去设置页导入」）。

---

## 7. 推荐技术栈

**默认推荐：Node.js + TypeScript + better-sqlite3 + Vite + React SPA**

- 与 WorkBuddy 同处 JS 生态，可直接复用其 `CREATE TABLE IF NOT EXISTS ...; --> statement-breakpoint` 迁移格式与脚本思路。
- `better-sqlite3` 同步 API，简单可靠，原生读写本地 SQLite 文件（契合「本地单文件」约束）。
- Vite + React 开发体验好，本地 dev server 即满足「零云端」。
- 迁移器复用相同 `--> statement-breakpoint` 分隔解析。

**备选**

- A. Python FastAPI + sqlite3 + 同 SPA：偏 Python 团队；但需维护两套生态。
- B. 零后端 sql.js（SQLite WASM）纯静态：最轻、可 `file://` 打开；但**无法以 mode=ro 安全挂 WorkBuddy 的 workbuddy.db**（WASM 只能读本地上传/IndexedDB 文件），自动化只读镜像需改为「导出后导入」，集成度下降。仅作纯演示分支。

**结论**：采用 Node + better-sqlite3 + React/Vite；迁移文件沿用 WorkBuddy 命名与分隔约定。

### 7.1 后端 API 设计（薄层，仅本地）

| Method | Path | 说明 |
| --- | --- | --- |
| GET | /api/stats | 仪表盘聚合统计 |
| GET | /api/skills?query=&source=&disabled= | 技能列表（分页+筛选） |
| GET | /api/skills/:slug | 技能详情 |
| GET | /api/expert-categories | 专家分类（带计数） |
| GET | /api/experts?query=&categoryId=&tag=&isOpc= | 专家列表（分页+筛选） |
| GET | /api/experts/:id | 专家详情 |
| GET/POST/PATCH/DELETE | /api/tasks | 任务 CRUD（+看板排序） |
| GET | /api/automations | 自动化只读镜像列表 |
| GET/POST/PATCH/DELETE | /api/automation-drafts | 编排草稿 CRUD |
| POST | /api/import | 全量重导技能/专家 |
| POST | /api/automations/refresh | 刷新自动化镜像 |
| POST | /api/launch | 启动技能/专家（服务端 spawn 已验证 deep-link + 剪贴板回退），返回 `{ok,type,ref,url,mode:'spawned'\|'url-only',fallbackPrompt,spawn,note}`；未命中记录 404、非法 ref 400 |
| GET | /api/launch | 启动能力诊断：`{exePath,available,candidates}`，供设置页展示 |
| GET | /api/expert-avatars/:id | 专家头像代理（id 白名单查表 → 磁盘缓存 → 远程 CDN），带 `X-Cache: hit\|miss\|neg` |
| GET | /api/expert-avatars-info | 头像诊断：`{base,count,cacheDir,remoteEnabled}` |
| GET/PUT | /api/prefs | 应用偏好 |


---

## 8. SQLite 数据模型（Draft DDL）

**数据库文件**：独立 `workbench.db`（与 `workbuddy.db` 分离；写操作只针对本库）。WorkBuddy 的 `workbuddy.db` 仅只读访问。

**迁移机制**：沿用 WorkBuddy 约定——目录 `migrations/`，文件 `0000_description.sql` …，语句间用 `--> statement-breakpoint` 分隔；用 `_migrations` 表记录已应用编号。

```sql
-- 0000_workbench_baseline.sql
CREATE TABLE IF NOT EXISTS _migrations (
    id TEXT PRIMARY KEY,
    applied_at INTEGER NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS skills (
    slug TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    file_path TEXT,
    description TEXT,
    description_zh TEXT,
    source TEXT,
    type TEXT,
    disabled INTEGER NOT NULL DEFAULT 0,
    version TEXT,
    installed_at INTEGER,
    marketplace_source TEXT,
    icon_url TEXT,
    examples_zh TEXT,
    skill_id TEXT,
    imported_at INTEGER NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS expert_categories (
    id TEXT PRIMARY KEY,
    name_zh TEXT,
    name_en TEXT,
    description_zh TEXT,
    description_en TEXT
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS experts (
    id TEXT PRIMARY KEY,
    category_id TEXT,
    display_name_zh TEXT, display_name_en TEXT,
    profession_zh TEXT, profession_en TEXT,
    description_zh TEXT, description_en TEXT,
    prompt_file TEXT,
    avatar TEXT,
    created_at TEXT, updated_at TEXT,
    default_init_prompt_zh TEXT, default_init_prompt_en TEXT,
    expert_type TEXT, agent_name TEXT, plugin TEXT,
    tags_zh TEXT, tags_en TEXT,
    quick_prompts_zh TEXT, quick_prompts_en TEXT,
    is_opc INTEGER NOT NULL DEFAULT 0,
    imported_at INTEGER NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'todo',
    due_date INTEGER,
    project TEXT,
    tags TEXT,
    notes TEXT,
    order_idx INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS automation_drafts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    prompt TEXT,
    status TEXT,
    schedule_type TEXT,
    rrule TEXT,
    scheduled_at TEXT,
    skills_json TEXT,
    expert_id TEXT,
    connector_ids_json TEXT,
    cwds TEXT,
    model_id TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS recent_items (
    kind TEXT NOT NULL,
    ref_key TEXT NOT NULL,
    last_opened_at INTEGER NOT NULL,
    PRIMARY KEY (kind, ref_key)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS app_prefs (
    key TEXT PRIMARY KEY,
    value TEXT
);
--> statement-breakpoint

-- 索引
CREATE INDEX IF NOT EXISTS idx_experts_category ON experts(category_id);
CREATE INDEX IF NOT EXISTS idx_experts_is_opc ON experts(is_opc);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_skills_source ON skills(source);
CREATE INDEX IF NOT EXISTS idx_recent_items_time ON recent_items(last_opened_at);
```

> 说明：自动化**真实运行数据**不经过本库写入；仅 `automation_drafts` 作规划层，运行时仍由 WorkBuddy 引擎执行。

---

## 9. 数据摄入与集成

### 9.1 技能/专家导入

- 触发器：首次启动自动导入；设置页「重新导入」手动触发；可选监听缓存文件 mtime。
- 源：技能 `.skill-list-cache.json` → 解析 `results[]` 按 `slug` upsert；专家 `manifest.json` → `categories[]` 写 `expert_categories`，experts 数组按 `id` upsert（中英拆分，数组存 JSON 文本）。
- 幂等：以 slug/id 主键 upsert；`imported_at` 记录版本。
- 容错：缓存文件缺失/版本不识别时给出告警并保留旧数据（见 §11 R1）。

### 9.2 自动化只读镜像

- 只读打开 WorkBuddy `workbuddy.db`：`file:<path>?mode=ro`（或 `readonly:true`）。
- 直接 `SELECT` 自 `automations`；WAL 模式支持并发读，安全。
- 若表结构与预期不符（WorkBuddy 升级），捕获错误并在 UI 提示「结构变更，镜像已暂停」。

### 9.3 启动技能 / 开启专家对话（不重写引擎）

> 2026-10-09 核实结论（详见 §15）：`workbuddy://` 协议确实存在，且**没有**任何"启动指定技能"或"注入并自动发送 prompt"的路由与 CLI 参数。因此本节按"能跳转 + 提示词靠剪贴板"落地。

- **专家（可直达）**：服务端 `spawn WorkBuddy.exe "workbuddy://experts?expertId=<id>"`。Electron 的 `second-instance` 会扫描 argv 接收该 URL，**不依赖系统是否注册协议**；URL 只由「通过字符白名单 + 在本库命中」的记录构造。
- **技能（只能开列表页）**：WorkBuddy 没有 per-skill 路由，改为打开 `workbuddy://skills?tab=installed`，并复制该技能的提示词。
- **回退**：未检测到 `WorkBuddy.exe` 时返回 `mode: 'url-only'`，前端改用 `window.open` + 剪贴板。
- **提示词始终需要人工粘贴**：这是 WorkBuddy 的能力边界，非本工作台缺陷。成功唤起且剪贴板可用时只给 2.5 秒轻提示，不弹窗。
- **自动化创建**：`automation_drafts` → 导出为与 WorkBuddy `automations` 字段对齐的 JSON + 可粘贴的中文创建指令（`status` 建议 `PAUSED`）。

---

## 10. 里程碑与验收

| 里程碑 | 内容 | DoD（完成定义） |
| --- | --- | --- |
| M1 MVP 骨架 | 技术栈落地 + `workbench.db` 迁移器 + 技能/专家导入 + 仪表盘 + 技能中心 + 专家目录 | 57 技能/448 专家全部可检索；首屏 < 500ms |
| M2 个人生产力 | 任务/待办（列表+看板）+ 自动化只读镜像 + 设置/导入/备份 + deep-link 启动 | 任务 CRUD/拖拽可用；能列出 WorkBuddy 自动化；备份可恢复 |
| M3 增强 | 自动化编排草稿 + 最近使用 + 全局搜索 | 草稿可导出为 WorkBuddy 创建命令；全局搜索覆盖技能+专家 |
| P2 可选 | 笔记/知识库模块 | Markdown 笔记 CRUD + 关联跳转 |
| 未来 | 云同步路径（schema 兼容、对象存储备份） | — |


---

## 11. 风险与开放问题

- **R1 缓存时效**：`.skill-list-cache.json` / `manifest.json` 是 WorkBuddy 生成物，可能清理或改格式（当前 version 6 / manifest 版本 2）。缓解：导入容错 + 版本检测 + 手动重导。
- **R2 只读安全**：读 `workbuddy.db` 须严格 `mode=ro`，绝不在本库写它；WorkBuddy 升级可能改 automations 表结构（已到 0017 迁移）。缓解：只读 SELECT + 结构变更告警。
- **OQ1 deep-link 协议 —— 已核实（2026-10-09，见 §15）**：结论为"部分可解"。可直达某位专家（`workbuddy://experts?expertId=`）；**无法**启动指定技能，也**无法**注入/自动发送 prompt。已据此替换掉早期实现里的无效路由 `workbuddy://skill/<slug>`、`workbuddy://expert/<ref>`。
- **OQ2 头像/图标资源 —— 已核实（2026-10-09，见 §15）**：专家头像**不是本地文件**（448 条磁盘命中 0），而是相对远程 CDN 的路径（base 在 `metadata.json` 的嵌套 `sourceSignature` 中）。改为后端白名单代理 + 磁盘缓存 + 文字头像兜底。技能 `iconUrl` 是 Electron 私有 `local-file://` scheme，本轮不做。
- **OQ3 多用户/设备**：当前单用户本地；云路径需账号体系（不在本期）。

---

## 12. 非功能性需求

- **性能**：本地 SQLite 查询；列表分页（默认 50/页）；首屏 < 500ms。
- **安全**：仅监听 127.0.0.1；对 `workbuddy.db` 强制只读连接（选项名必须是 `readOnly`）；不收集/上传任何数据。
- **隐私（出网）**：唯一出网行为是**可选**的专家头像拉取（腾讯云 CDN），可在设置页关闭；除此之外应用完全离线。
- **可靠性**：迁移原子执行（事务）；导入失败不破坏旧数据；`workbench.db` 拷贝即完整备份。只读镜像在受限环境下自动降级为「热备份快照」，仍不写 WorkBuddy 的库。
- **兼容性**：Windows 优先（当前环境）；路径均用绝对路径；缓存版本号校验；要求 Node ≥ 22（使用内置 `node:sqlite`）。
- **可维护性**：TypeScript 全栈类型（`npm run typecheck` 覆盖 `src` + `server` + `tests`）；迁移文件纯 SQL，沿用 WorkBuddy 约定；**零新增运行时依赖**，测试用 Node 内置 `node:test`。

---

## 13. 成功指标

- 导入准确率：技能/专家导入后与缓存 100% 一致（slug/id 对齐）。
- 启动时延：仪表盘首屏 < 500ms（本地 SQLite 查询）。
- 覆盖率：可检索 100% 的 57 技能与 448 专家。
- 留存：重度用户日均打开 ≥ 1 次；启动成功率按 `mode` 分布度量（`spawned` 占比），替代原「deep-link 成功率（OQ1 明确后度量）」。
- 备份可用性：拷贝 `workbench.db` 可在另一环境恢复全部个人数据。

---

## 14. 执行安排（重要）

> 历史记录（初版）：本回合只交付规格文档，应用开发作为独立后续回合执行。
> **现状（2026-10-09）**：M1~M3 已全部实现并落地，本文档已随实现持续更新；技术栈最终采用 **Node 内置 `node:sqlite`**（替代初版设想的 better-sqlite3，避免 native 编译，更契合"本地单文件/零额外依赖"）。

---

## 15. OQ1 / OQ2 核实结论（2026-10-09）

### 15.1 OQ1 · deep-link —— 部分可解，且早期实现是错的

**核实方法**：读 `resources/app.asar.unpacked/cli/product.json`、在 `resources/app.asar` 中检索路由表与 CLI flag 表、并在注册表不可读（`reg.exe` 被本机安全策略拦截）的情况下用 PID 集合对比做了 spawn 交接实验。

| 结论 | 依据 |
|---|---|
| `workbuddy://` 协议存在 | `product.json` 声明 `deepLinkSchemes:["workbuddy"]`；主进程 `setAsDefaultProtocolClient` 自注册 |
| 可用路由 | `workbuddy://experts?expertId=`、`skills?tab=installed`、`chat/<conversationId>`、`home`、`automation/run?automationId=`、`connectors`、`channels`、`teams/open`、`genie`、`agentmail` |
| **不存在**启动技能的路由/参数 | CLI（`cli/bin/codebuddy`）约 60 个 flag 中无 `--skill`/`--expert`；无 `launch-skill`/`use-skill` 类路由 |
| **不存在**注入/自动发送 prompt 的能力 | 无携带 prompt 的路由；`expert://<id>` 只是聊天内的 `@提及` token |
| spawn 可行且不重复开实例 | Electron `second-instance` 扫描 argv 中的 `workbuddy://`；实测触发 launch 前后 WorkBuddy 的 PID 集合完全一致（新进程交接后即退出） |

**因此修正**：早期实现里的 `workbuddy://skill/<slug>`、`workbuddy://expert/<ref>` **是无效路由**，已替换为上表的已验证路由；启动技能的语义如实降级为"打开已安装列表页 + 复制提示词"。

### 15.2 OQ2 · 头像 —— 不在本地，只能代理远程 CDN

| 结论 | 依据 |
|---|---|
| 本地 0 张头像 | 448 条 `avatar` 全部是 root-relative 路径；按 marketplace 根解析命中率 0/448 |
| 真实来源是腾讯云 CDN | `metadata.json` 的 `sourceSignature.baseUrl` = `https://acc-1258344699.cos.accelerate.myqcloud.com/workbuddy/expert-marketplace` |
| 必须二次 parse | `sourceSignature` 在该文件里是**嵌套的 JSON 字符串** |
| **必须字符串拼接** | `base + avatar` → 200；`new URL('/avatars/x.png', base)` 会抹掉 base 的路径段 → 403（已加回归测试钉住） |
| `/avatars/*` 100% 可取，`/plugins/*` 全部 404 | 抽样与逐条核对结论；后者前端直接短路，不发请求 |

**落地架构**：后端 id→URL 白名单代理（不拼接任何用户输入，只按 id 查表）→ 磁盘缓存（7 天 TTL、上游 404 记 24 小时负缓存、2MB 单图上限、200MB 总量上限、5 秒超时、非图片 Content-Type 一律拒收）→ 前端首字母文字头像兜底 → 设置页开关（关闭后零网络请求）。

### 15.3 顺带修复的两个真实缺陷

1. **只读选项名错误**：曾写成 `readonly`，正确是 `readOnly` —— 意味着对 `workbuddy.db` 的"只读"**实际未生效**。补 `typecheck` 后立即暴露并修复。
2. **只读句柄失效 / WAL 受限**：缓存的只读连接会因 WorkBuddy 的 WAL checkpoint 失效；且在部分受限环境下只读查询会因无法访问 `-shm` 而报 `unable to open database file`（普通文件读取正常）。改为**每次调用开短连接并关闭**，失败时降级为「热备份快照」（复制 db+wal 到本机缓存再读），全程不写 WorkBuddy 的库。