import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import {
  buildLaunchUrl,
  exeCandidates,
  resolveWorkbuddyExe,
  launchWorkbuddy,
  lookupLaunchRecord,
} from '../../server/launch.ts';
import { makeTempDb, insertSkill, insertExpert } from '../helpers/db.ts';

test('buildLaunchUrl: 使用已验证的 workbuddy:// 路由', () => {
  assert.equal(buildLaunchUrl('expert', 'ContentCreator'), 'workbuddy://experts?expertId=ContentCreator');
  // WorkBuddy 没有 per-skill 路由，只能打开已安装列表页
  assert.equal(buildLaunchUrl('skill', 'aihot'), 'workbuddy://skills?tab=installed');
  assert.equal(buildLaunchUrl('automation', 'a1'), 'workbuddy://automation/run?automationId=a1');
});

test('buildLaunchUrl: 拒绝非法 ref 与未知 type', () => {
  assert.equal(buildLaunchUrl('expert', 'a b'), null); // 空格
  assert.equal(buildLaunchUrl('expert', 'x/../y'), null); // 路径穿越
  assert.equal(buildLaunchUrl('expert', 'a&b=1'), null); // 参数注入
  assert.equal(buildLaunchUrl('expert', ''), null);
  assert.equal(buildLaunchUrl('expert', 'a'.repeat(65)), null);
  assert.equal(buildLaunchUrl('unknown', 'x'), null);
});

test('exeCandidates: 优先级为 env → LOCALAPPDATA → ProgramFiles → APPDATA', () => {
  const env = {
    WORKBUDDY_EXE: 'X:/custom/WorkBuddy.exe',
    LOCALAPPDATA: 'C:/Users/u/AppData/Local',
    ProgramFiles: 'C:/Program Files',
    APPDATA: 'C:/Users/u/AppData/Roaming',
  } as NodeJS.ProcessEnv;
  const c = exeCandidates(env);
  assert.equal(c[0], 'X:/custom/WorkBuddy.exe');
  assert.equal(c[1], join('C:/Users/u/AppData/Local', 'Programs', 'WorkBuddy', 'WorkBuddy.exe'));
  assert.equal(c[2], join('C:/Program Files', 'WorkBuddy', 'WorkBuddy.exe'));
  assert.equal(c[3], join('C:/Users/u/AppData/Roaming', 'WorkBuddy', 'WorkBuddy.exe'));
});

test('resolveWorkbuddyExe: 只返回真实存在的候选', () => {
  const env = {
    WORKBUDDY_EXE: 'X:/nope.exe',
    LOCALAPPDATA: 'C:/L',
    ProgramFiles: 'C:/P',
  } as NodeJS.ProcessEnv;
  // 全部不存在
  assert.equal(resolveWorkbuddyExe(env, () => false), null);
  // 仅 ProgramFiles 存在 → 应跳过前面的候选
  assert.equal(
    resolveWorkbuddyExe(env, (p) => p === join('C:/P', 'WorkBuddy', 'WorkBuddy.exe')),
    join('C:/P', 'WorkBuddy', 'WorkBuddy.exe')
  );
  // env 指定路径存在 → 最高优先级
  assert.equal(resolveWorkbuddyExe(env, (p) => p === 'X:/nope.exe'), 'X:/nope.exe');
});

test('launchWorkbuddy: URL 作为独立 argv 传入，shell=false', () => {
  const calls: any[] = [];
  const r = launchWorkbuddy(
    'workbuddy://experts?expertId=X',
    {
      exePath: 'C:/WB.exe',
      spawnFn: (exe, args, options) => {
        calls.push({ exe, args, options });
        return { pid: 999, unref: () => {} };
      },
    }
  );
  assert.equal(r.ok, true);
  assert.equal(r.pid, 999);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].exe, 'C:/WB.exe');
  assert.equal(calls[0].args.length, 1);
  assert.equal(calls[0].args[0], 'workbuddy://experts?expertId=X');
  assert.equal(calls[0].options.shell, false);
  assert.equal(calls[0].options.detached, true);
  assert.equal(calls[0].options.stdio, 'ignore');
});

test('launchWorkbuddy: 找不到 exe 时不 spawn', () => {
  const calls: any[] = [];
  const r = launchWorkbuddy('workbuddy://home', {
    exePath: null,
    env: { WORKBUDDY_EXE: 'X:/nope.exe' } as NodeJS.ProcessEnv,
    spawnFn: (exe, args, options) => {
      calls.push({ exe, args, options });
      return { pid: 1, unref: () => {} };
    },
  });
  assert.equal(r.attempted, false);
  assert.equal(r.ok, false);
  assert.ok(r.error);
  assert.equal(calls.length, 0);
});

test('launchWorkbuddy: spawn 抛错时返回错误而不抛出', () => {
  const r = launchWorkbuddy('workbuddy://home', {
    exePath: 'C:/WB.exe',
    spawnFn: () => {
      throw new Error('boom');
    },
  });
  assert.equal(r.ok, false);
  assert.equal(r.error, 'boom');
});

test('lookupLaunchRecord: skill 生成含名称/示例的提示词', (t) => {
  const tmp = makeTempDb();
  t.after(() => tmp.cleanup());
  insertSkill(tmp.db, {
    slug: 'aihot',
    name: 'AI HOT',
    description: 'AI 资讯查询',
    examples_zh: JSON.stringify(['查今日 AI 新闻', '看 AI 日报']),
  });
  const hit = lookupLaunchRecord(tmp.db, 'skill', 'aihot');
  assert.equal(hit.found, true);
  assert.ok(hit.fallbackPrompt.includes('AI HOT'));
  assert.ok(hit.fallbackPrompt.includes('示例：'));
  assert.ok(hit.fallbackPrompt.includes('查今日 AI 新闻；看 AI 日报'));
  assert.equal(lookupLaunchRecord(tmp.db, 'skill', 'nope').found, false);
});

test('lookupLaunchRecord: expert 三级降级 init提示 → 中文名 → ref', (t) => {
  const tmp = makeTempDb();
  t.after(() => tmp.cleanup());
  insertExpert(tmp.db, { id: 'E1', display_name_zh: '文博凯', default_init_prompt_zh: '你是内容创作专家' });
  insertExpert(tmp.db, { id: 'E2', display_name_zh: '小明' });
  insertExpert(tmp.db, { id: 'E3' });

  assert.equal(lookupLaunchRecord(tmp.db, 'expert', 'E1').fallbackPrompt, '你是内容创作专家');
  assert.equal(lookupLaunchRecord(tmp.db, 'expert', 'E2').fallbackPrompt, '小明');
  assert.equal(lookupLaunchRecord(tmp.db, 'expert', 'E3').fallbackPrompt, 'E3');
  assert.equal(lookupLaunchRecord(tmp.db, 'expert', 'NOPE').found, false);
});
