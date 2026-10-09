import { spawn as nodeSpawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { safeJsonArray } from './sqlite-util.ts';

/**
 * 允许出现在 deep-link 中的 ref 字符集。
 * URL 始终由「通过该校验 + 在本库中命中」的记录构造，
 * 因此原始用户输入永远不会被拼进 URL。
 */
export const REF_RE = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * WorkBuddy 已验证可用的 workbuddy:// 路由（核实于 2026-10，来源 app.asar 路由表）：
 *   workbuddy://experts?expertId=<id>     —— 可直达某位专家
 *   workbuddy://skills?tab=installed     —— 只能打开已安装技能列表（没有 per-skill 路由）
 *   workbuddy://chat/<conversationId>     —— 打开既有会话
 *   workbuddy://automation/run?automationId=
 * 注意：不存在"启动指定技能"或"注入并发送 prompt"的路由/CLI 参数，
 * 因此技能侧只能打开列表页 + 复制提示词。
 */
export function buildLaunchUrl(type: string, ref: string): string | null {
  if (!REF_RE.test(ref)) return null;
  switch (type) {
    case 'expert':
      return `workbuddy://experts?expertId=${encodeURIComponent(ref)}`;
    case 'skill':
      return 'workbuddy://skills?tab=installed';
    case 'automation':
      return `workbuddy://automation/run?automationId=${encodeURIComponent(ref)}`;
    default:
      return null;
  }
}

export type SpawnFn = (
  exe: string,
  args: string[],
  options: Record<string, unknown>
) => { pid?: number; unref?: () => void };

/** WorkBuddy.exe 的候选路径，按优先级排列 */
export function exeCandidates(env: NodeJS.ProcessEnv = process.env): string[] {
  const out: string[] = [];
  if (env.WORKBUDDY_EXE) out.push(env.WORKBUDDY_EXE);
  if (env.LOCALAPPDATA) out.push(join(env.LOCALAPPDATA, 'Programs', 'WorkBuddy', 'WorkBuddy.exe'));
  if (env.ProgramFiles) out.push(join(env.ProgramFiles, 'WorkBuddy', 'WorkBuddy.exe'));
  if (env['ProgramFiles(x86)']) out.push(join(env['ProgramFiles(x86)'], 'WorkBuddy', 'WorkBuddy.exe'));
  if (env.APPDATA) out.push(join(env.APPDATA, 'WorkBuddy', 'WorkBuddy.exe'));
  return out;
}

/** 返回第一个真实存在的候选路径；都不存在则 null */
export function resolveWorkbuddyExe(
  env: NodeJS.ProcessEnv = process.env,
  exists: (p: string) => boolean = existsSync
): string | null {
  for (const p of exeCandidates(env)) {
    try {
      if (exists(p)) return p;
    } catch {
      /* 忽略探测异常 */
    }
  }
  return null;
}

export interface SpawnOutcome {
  attempted: boolean;
  ok: boolean;
  pid?: number;
  error?: string;
}

/**
 * 服务端唤起 WorkBuddy：把 workbuddy:// URL 作为独立 argv 传给 exe。
 * Electron 的 second-instance 处理器会扫描 argv 找该 URL，
 * 因此这条路径不依赖系统是否注册了协议（注册表被安全策略拦截时依然有效）。
 */
export function launchWorkbuddy(
  url: string,
  opts: { exePath?: string | null; spawnFn?: SpawnFn; env?: NodeJS.ProcessEnv } = {}
): SpawnOutcome {
  const env = opts.env ?? process.env;
  const exe = opts.exePath ?? resolveWorkbuddyExe(env);
  if (!exe) return { attempted: false, ok: false, error: '未找到 WorkBuddy.exe' };
  const spawnFn = opts.spawnFn ?? (nodeSpawn as unknown as SpawnFn);
  try {
    const child = spawnFn(exe, [url], {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
      shell: false,
    });
    child.unref?.();
    return { attempted: true, ok: true, pid: child.pid };
  } catch (e) {
    return { attempted: true, ok: false, error: (e as Error).message };
  }
}

export interface LaunchRecord {
  found: boolean;
  fallbackPrompt: string;
}

/**
 * 在本库中查找可启动对象，并生成提示词回退内容。
 * 未命中时 found=false（路由据此返回 404，绝不会拿到"看起来合法"的假 URL）。
 */
export function lookupLaunchRecord(db: DatabaseSync, type: string, ref: string): LaunchRecord {
  if (type === 'skill') {
    const row = db
      .prepare('SELECT name,description,examples_zh FROM skills WHERE slug=?')
      .get(ref) as any;
    if (!row) return { found: false, fallbackPrompt: ref };
    const examples = safeJsonArray(row.examples_zh);
    const fallback = `${row.name}\n${row.description || ''}${
      examples.length ? '\n示例：' + examples.join('；') : ''
    }`;
    return { found: true, fallbackPrompt: fallback };
  }
  if (type === 'expert') {
    const row = db
      .prepare('SELECT display_name_zh,default_init_prompt_zh FROM experts WHERE id=?')
      .get(ref) as any;
    if (!row) return { found: false, fallbackPrompt: ref };
    // 三级降级：初始化提示 → 中文名 → ref
    const fallback = row.default_init_prompt_zh || row.display_name_zh || ref;
    return { found: true, fallbackPrompt: fallback };
  }
  // automation 等类型不在本库管理，直接视为可启动（URL 仍受 REF_RE 白名单保护）
  return { found: true, fallbackPrompt: ref };
}
