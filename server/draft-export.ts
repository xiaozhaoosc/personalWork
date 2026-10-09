import { safeJsonArray, splitCsv } from './sqlite-util.ts';

export const DRAFT_EXPORT_NOTE =
  'WorkBuddy 未提供"注入并自动发送 prompt"的协议入口，请将下面的创建指令粘贴到 WorkBuddy 对话中，由它创建真正的自动化。JSON 仅供程序化使用。';

export interface DraftExport {
  json: Record<string, unknown>;
  prompt: string;
  note: string;
}

/**
 * 把 automation_drafts 的一行转换为「可直接交给 WorkBuddy 的创建材料」：
 * 1) json —— 与 WorkBuddy automations 字段对齐的结构（status 建议 PAUSED）
 * 2) prompt —— 可直接粘贴到 WorkBuddy 对话里的中文创建指令
 */
export function buildDraftExport(d: any, note: string = DRAFT_EXPORT_NOTE): DraftExport {
  const skills = safeJsonArray(d.skills_json);
  const connectorIds = safeJsonArray(d.connector_ids_json);
  const cwds = splitCsv(d.cwds);

  const isOnce = d.schedule_type === 'once';
  const json: Record<string, unknown> = {
    name: d.name,
    prompt: d.prompt || '',
    scheduleType: isOnce ? 'once' : 'recurring',
    status: 'PAUSED',
    skills,
    connectorIds,
  };
  if (isOnce) json.scheduledAt = d.scheduled_at || undefined;
  else json.rrule = d.rrule || undefined;
  if (d.expert_id) json.expertId = d.expert_id;
  if (cwds.length) json.cwds = cwds;
  if (d.model_id) json.modelId = d.model_id;

  const plan = isOnce
    ? `一次性执行：${d.scheduled_at || '（未设置时间，请补充）'}`
    : `周期执行（RRULE: ${d.rrule || '（未设置，请补充）'}）`;

  const prompt = [
    '请帮我创建一个自动化任务，创建后保持暂停（PAUSED）状态，待我确认后再启用：',
    `- 名称：${d.name}`,
    `- 执行内容：${d.prompt || '（无）'}`,
    `- 计划：${plan}`,
    skills.length ? `- 使用技能：${skills.join('、')}` : '',
    d.expert_id ? `- 使用专家：${d.expert_id}` : '',
    cwds.length ? `- 工作目录：${cwds.join('、')}` : '',
    d.model_id ? `- 模型：${d.model_id}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return { json, prompt, note };
}
