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

CREATE INDEX IF NOT EXISTS idx_experts_category ON experts(category_id);
CREATE INDEX IF NOT EXISTS idx_experts_is_opc ON experts(is_opc);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_skills_source ON skills(source);
CREATE INDEX IF NOT EXISTS idx_recent_items_time ON recent_items(last_opened_at);
