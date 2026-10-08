import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getJson } from '../api';

export default function Dashboard() {
  const [stats, setStats] = useState<any>(null);
  const [cats, setCats] = useState<Record<string, string>>({});
  const [recent, setRecent] = useState<any[]>([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    getJson('/stats')
      .then(setStats)
      .catch((e) => setErr(String(e)));
    getJson('/expert-categories')
      .then((rows: any[]) => {
        const m: Record<string, string> = {};
        rows.forEach((r) => (m[r.id] = r.name_zh || r.id));
        setCats(m);
      })
      .catch(() => {});
    getJson('/recent').then(setRecent).catch(() => {});
  }, []);

  if (err) return <div className="empty">{err}</div>;
  if (!stats) return <div className="empty">加载中…</div>;

  const taskTotal = stats.tasks.byStatus.reduce((a: number, b: any) => a + b.c, 0);
  const taskDone = stats.tasks.byStatus.find((t: any) => t.status === 'done')?.c || 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>总览</h1>
          <p>本地优先的 WorkBuddy 个人效率驾驶舱</p>
        </div>
      </div>

      <div className="grid cols-4">
        <div className="card stat">
          <div className="label">技能总数</div>
          <div className="value">{stats.skills.total}</div>
          <div className="sub">{stats.skills.bySource.map((s: any) => `${s.source}:${s.c}`).join(' · ')}</div>
        </div>
        <div className="card stat">
          <div className="label">专家总数</div>
          <div className="value">{stats.experts.total}</div>
          <div className="sub">覆盖 {stats.experts.byCategory.length} 个分类</div>
        </div>
        <div className="card stat">
          <div className="label">待办任务</div>
          <div className="value">{taskTotal}</div>
          <div className="sub">已完成 {taskDone}</div>
        </div>
        <div className="card stat">
          <div className="label">自动化</div>
          <div className="value">{stats.automations.total}</div>
          <div className="sub">
            {stats.automations.error ? '镜像不可用' : `启用 ${stats.automations.enabled}`}
          </div>
        </div>
      </div>

      <div className="grid cols-2" style={{ marginTop: 16 }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>专家分类分布</h3>
          <div className="list">
            {stats.experts.byCategory.map((c: any) => (
              <div key={c.category_id} className="row-item" style={{ cursor: 'default' }}>
                <div style={{ flex: 1 }}>
                  <div className="title">{cats[c.category_id] || c.category_id}</div>
                </div>
                <span className="tag blue">{c.c}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>最近使用</h3>
          {recent.length === 0 ? (
            <div className="muted">暂无记录。在技能/专家详情页查看后会在此显示。</div>
          ) : (
            <div className="list">
              {recent.map((r, i) => (
                <div key={i} className="row-item" style={{ cursor: 'default' }}>
                  <span className={`tag ${r.kind === 'skill' ? 'blue' : ''}`}>{r.kind}</span>
                  <div className="title">{r.ref_key}</div>
                </div>
              ))}
            </div>
          )}
          <div className="toolbar" style={{ marginTop: 12 }}>
            <Link className="btn primary" to="/skills">浏览技能</Link>
            <Link className="btn" to="/experts">浏览专家</Link>
            <Link className="btn" to="/tasks">我的任务</Link>
          </div>
        </div>
      </div>
    </>
  );
}
