import { useEffect, useState } from 'react';
import { getJson, sendJson } from '../api';

const RRULE_PRESETS = [
  { label: '每天 09:00', value: 'FREQ=DAILY;BYHOUR=9;BYMINUTE=0' },
  { label: '每小时', value: 'FREQ=HOURLY;INTERVAL=1' },
  { label: '工作日 09:00', value: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=9;BYMINUTE=0' },
  { label: '每周一 09:00', value: 'FREQ=WEEKLY;BYDAY=MO;BYHOUR=9;BYMINUTE=0' },
];

interface DraftForm {
  id?: string;
  name: string;
  prompt: string;
  scheduleType: 'recurring' | 'once';
  rrule: string;
  scheduledAt: string;
  skills: string[];
  expertId: string;
  cwds: string;
  modelId: string;
}

const EMPTY_FORM: DraftForm = {
  name: '',
  prompt: '',
  scheduleType: 'recurring',
  rrule: RRULE_PRESETS[0].value,
  scheduledAt: '',
  skills: [],
  expertId: '',
  cwds: '',
  modelId: '',
};

function parseArr(json?: string): string[] {
  try {
    const v = json ? JSON.parse(json) : [];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export default function Automations() {
  const [data, setData] = useState<{ rows: any[]; error?: string } | null>(null);
  const [drafts, setDrafts] = useState<any[]>([]);
  const [skills, setSkills] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<DraftForm>(EMPTY_FORM);
  const [exp, setExp] = useState<{ json: string; prompt: string; note: string } | null>(null);
  const [copied, setCopied] = useState('');

  async function load() {
    setData(await getJson('/automations'));
    setDrafts(await getJson('/automation-drafts'));
  }
  useEffect(() => { load(); }, []);

  async function ensureSkills() {
    if (!skills.length) {
      const s = await getJson('/skills?pageSize=200');
      setSkills(s.rows);
    }
  }

  async function openCreate() {
    setForm(EMPTY_FORM);
    setShowForm(true);
    await ensureSkills();
  }

  async function openEdit(d: any) {
    setForm({
      id: d.id,
      name: d.name,
      prompt: d.prompt || '',
      scheduleType: d.schedule_type === 'once' ? 'once' : 'recurring',
      rrule: d.rrule || '',
      scheduledAt: d.scheduled_at || '',
      skills: parseArr(d.skills_json),
      expertId: d.expert_id || '',
      cwds: d.cwds || '',
      modelId: d.model_id || '',
    });
    setShowForm(true);
    await ensureSkills();
  }

  async function save() {
    const body: any = {
      name: form.name.trim(),
      prompt: form.prompt,
      schedule_type: form.scheduleType,
      status: 'draft',
      skills: form.skills,
      expert_id: form.expertId || null,
      cwds: form.cwds || null,
      model_id: form.modelId || null,
    };
    if (form.scheduleType === 'once') body.scheduled_at = form.scheduledAt || null;
    else body.rrule = form.rrule || null;
    if (form.id) await sendJson('/automation-drafts/' + form.id, 'PATCH', body);
    else await sendJson('/automation-drafts', 'POST', body);
    setShowForm(false);
    load();
  }

  async function del(id: string) {
    await sendJson('/automation-drafts/' + id, 'DELETE');
    load();
  }

  async function exportDraft(id: string) {
    const e = await getJson('/automation-drafts/' + id + '/export');
    setExp({ json: JSON.stringify(e.json, null, 2), prompt: e.prompt, note: e.note });
    setCopied('');
  }

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(''), 1500);
    } catch { /* 剪贴板不可用时忽略 */ }
  }

  function fmtSchedule(d: any) {
    if (d.schedule_type === 'once') return `一次性 ${d.scheduled_at || '—'}`;
    return d.rrule || '—';
  }

  return (
    <>
      <div className="page-head">
        <div><h1>自动化</h1><p>编排草稿在工作台规划，导出指令后由 WorkBuddy 真正创建；下方镜像只读自 workbuddy.db</p></div>
        <button className="btn primary" onClick={openCreate}>新建草稿</button>
      </div>

      {/* ---- 编排草稿 ---- */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>我的编排草稿（{drafts.length}）</h3>
        {drafts.length === 0 ? (
          <div className="empty" style={{ marginTop: 10 }}>
            还没有草稿。点「新建草稿」规划一个自动化，再「导出」创建指令交给 WorkBuddy 执行。
          </div>
        ) : (
          <div className="list" style={{ marginTop: 10 }}>
            {drafts.map((d) => (
              <div key={d.id} className="row-item" style={{ cursor: 'default' }}>
                <div style={{ flex: 1 }}>
                  <div className="title">{d.name}</div>
                  <div className="meta">
                    {d.schedule_type === 'once' ? '单次' : '周期'} · {fmtSchedule(d)}
                    {parseArr(d.skills_json).length ? ' · 技能: ' + parseArr(d.skills_json).join('、') : ''}
                    {d.expert_id ? ` · 专家: ${d.expert_id}` : ''}
                  </div>
                </div>
                <button className="btn sm primary" onClick={() => exportDraft(d.id)}>导出</button>
                <button className="btn sm" onClick={() => openEdit(d)}>编辑</button>
                <button className="btn sm danger" onClick={() => del(d.id)}>删除</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ---- WorkBuddy 只读镜像 ---- */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>WorkBuddy 自动化（只读镜像）</h3>
          <button className="btn sm" onClick={load}>刷新镜像</button>
        </div>
        <div style={{ marginTop: 10 }}>
          {data?.error && <div className="empty">无法读取自动化：{data.error}</div>}
          {data && !data.error && data.rows.length === 0 && <div className="empty">WorkBuddy 中暂无自动化任务</div>}
          {data && !data.error && data.rows.length > 0 && (
            <table>
              <thead>
                <tr><th>名称</th><th>状态</th><th>类型</th><th>RRULE</th><th>技能 / 专家</th><th>创建时间</th></tr>
              </thead>
              <tbody>
                {data.rows.map((a: any) => (
                  <tr key={a.id}>
                    <td>{a.name}</td>
                    <td><span className={`tag ${a.status === 'ACTIVE' ? 'blue' : ''}`}>{a.status}</span></td>
                    <td>{a.schedule_type === 'recurring' ? '周期' : a.schedule_type === 'once' ? '单次' : a.schedule_type}</td>
                    <td className="muted">{a.rrule || a.scheduled_at || '—'}</td>
                    <td className="muted">
                      {parseArr(a.skills_json).join(', ') || '—'}
                      {a.expert_id ? ` · 专家:${a.expert_id}` : ''}
                    </td>
                    <td className="muted">{a.created_at || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ---- 新建/编辑草稿 ---- */}
      {showForm && (
        <div className="modal-mask" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button className="close" onClick={() => setShowForm(false)}>×</button>
            <h2>{form.id ? '编辑草稿' : '新建编排草稿'}</h2>
            <label>名称 *
              <input style={{ width: '100%', marginTop: 4 }} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="如：每日 AI 资讯" />
            </label>
            <label style={{ display: 'block', marginTop: 10 }}>执行内容（发送给 WorkBuddy 的 prompt）
              <textarea rows={3} style={{ width: '100%', marginTop: 4 }} value={form.prompt} onChange={(e) => setForm({ ...form, prompt: e.target.value })} placeholder="如：抓取今日 AI 热点并生成中文简报" />
            </label>
            <div style={{ marginTop: 10 }}>
              计划类型：
              <label style={{ marginLeft: 8 }}>
                <input type="radio" checked={form.scheduleType === 'recurring'} onChange={() => setForm({ ...form, scheduleType: 'recurring' })} /> 周期
              </label>
              <label style={{ marginLeft: 8 }}>
                <input type="radio" checked={form.scheduleType === 'once'} onChange={() => setForm({ ...form, scheduleType: 'once' })} /> 单次
              </label>
            </div>
            {form.scheduleType === 'recurring' ? (
              <div style={{ marginTop: 8 }}>
                常用计划：
                <select
                  value={RRULE_PRESETS.some((p) => p.value === form.rrule) ? form.rrule : ''}
                  onChange={(e) => setForm({ ...form, rrule: e.target.value })}
                  style={{ marginLeft: 6 }}
                >
                  {RRULE_PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                  <option value="">自定义…</option>
                </select>
                <input style={{ width: '100%', marginTop: 6 }} placeholder="RRULE（RFC 5545，如 FREQ=DAILY;BYHOUR=9;BYMINUTE=0）" value={form.rrule} onChange={(e) => setForm({ ...form, rrule: e.target.value })} />
              </div>
            ) : (
              <label style={{ display: 'block', marginTop: 8 }}>执行时间
                <input type="datetime-local" style={{ width: '100%', marginTop: 4 }} value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} />
              </label>
            )}
            <div style={{ marginTop: 10 }}>
              使用技能（可选）：
              <div style={{ margin: '6px 0' }}>
                {form.skills.map((s) => (
                  <span key={s} className="tag blue" style={{ cursor: 'pointer' }} title="点击移除" onClick={() => setForm({ ...form, skills: form.skills.filter((x) => x !== s) })}>{s} ×</span>
                ))}
                {!form.skills.length && <span className="muted">未选择</span>}
              </div>
              <select value="" onChange={(e) => { const v = e.target.value; if (v && !form.skills.includes(v)) setForm({ ...form, skills: [...form.skills, v] }); }}>
                <option value="">＋ 添加技能…</option>
                {skills.map((s) => <option key={s.slug} value={s.slug}>{s.name}</option>)}
              </select>
            </div>
            <label style={{ display: 'block', marginTop: 10 }}>专家 ID（可选）
              <input style={{ width: '100%', marginTop: 4 }} value={form.expertId} onChange={(e) => setForm({ ...form, expertId: e.target.value })} placeholder="WorkBuddy 专家 id" />
            </label>
            <label style={{ display: 'block', marginTop: 10 }}>工作目录（可选，多个用逗号分隔）
              <input style={{ width: '100%', marginTop: 4 }} value={form.cwds} onChange={(e) => setForm({ ...form, cwds: e.target.value })} />
            </label>
            <div className="toolbar" style={{ marginTop: 16 }}>
              <button className="btn primary" disabled={!form.name.trim()} onClick={save}>保存草稿</button>
              <button className="btn" onClick={() => setShowForm(false)}>取消</button>
            </div>
          </div>
        </div>
      )}

      {/* ---- 导出创建命令 ---- */}
      {exp && (
        <div className="modal-mask" onClick={() => setExp(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button className="close" onClick={() => setExp(null)}>×</button>
            <h2>导出创建命令</h2>
            <p className="muted">方式一（推荐）：把下面的指令粘贴到 WorkBuddy 对话中，由 WorkBuddy 创建真正的自动化。</p>
            <div className="code">{exp.prompt}</div>
            <button className="btn sm" style={{ marginTop: 6 }} onClick={() => copy(exp.prompt, 'p')}>{copied === 'p' ? '已复制 ✓' : '复制指令'}</button>
            <p className="muted" style={{ marginTop: 14 }}>方式二：JSON 结构（与 WorkBuddy automations 字段对齐）。</p>
            <div className="code">{exp.json}</div>
            <button className="btn sm" style={{ marginTop: 6 }} onClick={() => copy(exp.json, 'j')}>{copied === 'j' ? '已复制 ✓' : '复制 JSON'}</button>
            <p className="muted" style={{ marginTop: 10 }}>{exp.note}</p>
          </div>
        </div>
      )}
    </>
  );
}
