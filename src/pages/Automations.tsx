import { useEffect, useState } from 'react';
import { getJson, sendJson } from '../api';

export default function Automations() {
  const [data, setData] = useState<{ rows: any[]; error?: string } | null>(null);

  async function load() {
    setData(await getJson('/automations'));
  }
  useEffect(() => { load(); }, []);

  function parseSkills(json?: string) {
    if (!json) return [];
    try { return JSON.parse(json); } catch { return []; }
  }

  function fmtTime(v: any) {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return '—';
    return new Date(n).toLocaleString('zh-CN');
  }

  return (
    <>
      <div className="page-head">
        <div><h1>自动化</h1><p>只读镜像自 WorkBuddy 的 workbuddy.db（绝不写回）</p></div>
        <button className="btn" onClick={load}>刷新镜像</button>
      </div>

      {!data && <div className="empty">加载中…</div>}
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
                  {parseSkills(a.skills_json).join(', ') || '—'}
                  {a.expert_id ? ` · 专家:${a.expert_id}` : ''}
                </td>
                <td className="muted">{fmtTime(a.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="muted" style={{ marginTop: 12 }}>
        提示：真正的自动化运行仍由 WorkBuddy 引擎负责。本页仅做可视化与只读检查。如需新建，请在「设置」中保存编排草稿，再于 WorkBuddy 中创建。
      </p>
    </>
  );
}
