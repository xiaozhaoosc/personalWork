import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDraftExport } from '../../server/draft-export.ts';

const base = {
  id: 'd1',
  name: '每日 AI 资讯',
  prompt: '抓取今日 AI 热点',
  schedule_type: 'recurring',
  rrule: 'FREQ=DAILY;BYHOUR=9;BYMINUTE=0',
  scheduled_at: null,
  skills_json: '["aihot"]',
  connector_ids_json: '[]',
  expert_id: null,
  cwds: null,
  model_id: null,
};

test('recurring: scheduleType=rrecurring 且带 rrule、不带 scheduledAt', () => {
  const { json } = buildDraftExport(base);
  assert.equal(json.scheduleType, 'recurring');
  assert.equal(json.rrule, 'FREQ=DAILY;BYHOUR=9;BYMINUTE=0');
  assert.equal('scheduledAt' in json, false);
});

test('once: scheduleType=once 且带 scheduledAt、不带 rrule', () => {
  const { json } = buildDraftExport({
    ...base,
    schedule_type: 'once',
    scheduled_at: '2026-12-01T09:00',
    rrule: null,
  });
  assert.equal(json.scheduleType, 'once');
  assert.equal(json.scheduledAt, '2026-12-01T09:00');
  assert.equal('rrule' in json, false);
});

test('status 恒为 PAUSED（覆盖 once / recurring / 自身为 active）', () => {
  assert.equal(buildDraftExport(base).json.status, 'PAUSED');
  assert.equal(buildDraftExport({ ...base, status: 'active' }).json.status, 'PAUSED');
  assert.equal(
    buildDraftExport({ ...base, schedule_type: 'once', status: 'ACTIVE' }).json.status,
    'PAUSED'
  );
});

test('cwds 按中英文逗号/分号切分、去空、去首尾空格', () => {
  const { json } = buildDraftExport({ ...base, cwds: ' a,b ;c，d；e ,, ' });
  assert.deepEqual(json.cwds, ['a', 'b', 'c', 'd', 'e']);
});

test('cwds 为空时字段缺省', () => {
  const { json } = buildDraftExport({ ...base, cwds: null });
  assert.equal('cwds' in json, false);
  const { json: json2 } = buildDraftExport({ ...base, cwds: '  ,  ; ' });
  assert.equal('cwds' in json2, false);
});

test('skills_json 容错：null / 空 / 非法 JSON / 非数组', () => {
  for (const v of [null, '', 'not json', '{"a":1}']) {
    const { json, prompt } = buildDraftExport({ ...base, skills_json: v as any });
    assert.deepEqual(json.skills, [], `skills_json=${v} 应容错为 []`);
    assert.equal(prompt.includes('使用技能'), false);
  }
});

test('prompt 包含关键行，空项被过滤', () => {
  const { prompt } = buildDraftExport({
    ...base,
    expert_id: 'ContentCreator',
    cwds: '/a,/b',
    model_id: 'gpt',
  });
  assert.ok(prompt.includes('保持暂停（PAUSED）状态'));
  assert.ok(prompt.includes('- 名称：每日 AI 资讯'));
  assert.ok(prompt.includes('- 使用技能：aihot'));
  assert.ok(prompt.includes('- 使用专家：ContentCreator'));
  assert.ok(prompt.includes('- 工作目录：/a、/b'));
  assert.ok(prompt.includes('- 模型：gpt'));
  assert.equal(prompt.includes('\n\n'), false); // 无空行
  assert.equal(prompt.includes('- 使用技能：\n'), false);
});

test('prompt: 缺 rrule 时给出提示文案', () => {
  const { prompt } = buildDraftExport({ ...base, rrule: null });
  assert.ok(prompt.includes('未设置'));
});
