import { useEffect, useState } from 'react';
import { getJson } from '../api';
import { useLaunch } from '../hooks/useLaunch';
import Toast from '../components/Toast';

interface FilterOpts {
  query?: string;
  source?: string;
  disabled?: string;
  page?: number;
}

const PAGE_SIZE = 50;

export default function Skills() {
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [source, setSource] = useState('');
  const [disabled, setDisabled] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [sel, setSel] = useState<any>(null);
  const { msg, setMsg, toast, launch, busy } = useLaunch();

  // 显式传参，避免 stale closure：opts 优先于当前 state
  async function load(opts?: FilterOpts) {
    const query = opts?.query ?? q;
    const src = opts?.source ?? source;
    const dis = opts?.disabled ?? disabled;
    const pg = opts?.page ?? page;
    const params = new URLSearchParams();
    if (query) params.set('query', query);
    if (src) params.set('source', src);
    if (dis) params.set('disabled', dis);
    if (pg > 1) params.set('page', String(pg));
    const data = await getJson('/skills?' + params.toString());
    setRows(data.rows);
    setTotal(data.total);
  }
  useEffect(() => { load(); }, []);

  function reset() {
    setQ('');
    setSource('');
    setDisabled('');
    setPage(1);
    load({ query: '', source: '', disabled: '', page: 1 });
  }

  async function openDetail(slug: string) {
    setSel(await getJson('/skills/' + encodeURIComponent(slug)));
  }

  function goPage(p: number) {
    setPage(p);
    load({ page: p });
    window.scrollTo({ top: 0 });
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const sources = ['userSettings', 'builtin', 'plugin'];

  return (
    <>
      <div className="page-head">
        <div><h1>技能中心</h1><p>已匹配 {total} 个技能（实时镜像自 WorkBuddy 缓存）</p></div>
      </div>

      <div className="toolbar">
        <input type="search" placeholder="搜索名称 / 描述 / slug" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (setPage(1), load({ page: 1 }))} />
        <select value={source} onChange={(e) => { setSource(e.target.value); setPage(1); load({ source: e.target.value, page: 1 }); }}>
          <option value="">全部来源</option>
          {sources.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={disabled} onChange={(e) => { setDisabled(e.target.value); setPage(1); load({ disabled: e.target.value, page: 1 }); }}>
          <option value="">启用状态</option>
          <option value="0">启用</option>
          <option value="1">禁用</option>
        </select>
        <button className="btn primary" onClick={() => { setPage(1); load({ page: 1 }); }}>搜索</button>
        <button className="btn" onClick={reset}>重置</button>
      </div>

      <div className="list">
        {rows.map((s) => (
          <div key={s.slug} className="row-item" onClick={() => openDetail(s.slug)}>
            <div style={{ flex: 1 }}>
              <div className="title">{s.name}</div>
              <div className="meta">{s.description_zh || s.description || ''}</div>
            </div>
            <span className="tag">{s.source}</span>
            {s.disabled ? <span className="tag">禁用</span> : <span className="tag blue">启用</span>}
          </div>
        ))}
        {rows.length === 0 && <div className="empty">没有匹配的技能</div>}
      </div>

      {total > PAGE_SIZE && (
        <div className="toolbar" style={{ marginTop: 14 }}>
          <button className="btn sm" disabled={page <= 1} onClick={() => goPage(page - 1)}>上一页</button>
          <span className="muted">第 {page} / {totalPages} 页 · 共 {total} 条</span>
          <button className="btn sm" disabled={page >= totalPages} onClick={() => goPage(page + 1)}>下一页</button>
        </div>
      )}

      {sel && (
        <div className="modal-mask" onClick={() => setSel(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button className="close" onClick={() => setSel(null)}>×</button>
            <h2>{sel.name}</h2>
            <div className="meta">slug: {sel.slug} · 来源: {sel.source} · 类型: {sel.type}</div>
            <p>{sel.description_zh || sel.description || '（无描述）'}</p>
            {sel.examples_zh && (
              <div>
                <strong>示例：</strong>
                <div className="code">{(() => { try { return JSON.parse(sel.examples_zh).join('\n'); } catch { return sel.examples_zh; } })()}</div>
              </div>
            )}
            <div className="toolbar" style={{ marginTop: 14 }}>
              <button className="btn primary" disabled={busy} onClick={() => launch('skill', sel.slug)}>
                {busy ? '正在唤起…' : '启动技能'}
              </button>
              {sel.file_path && <span className="muted">{sel.file_path}</span>}
            </div>
          </div>
        </div>
      )}

      {msg && (
        <div className="modal-mask" onClick={() => setMsg('')}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button className="close" onClick={() => setMsg('')}>×</button>
            <h2>启动提示</h2>
            <div className="code">{msg}</div>
            <div className="toolbar" style={{ marginTop: 12 }}>
              <button className="btn" onClick={() => setMsg('')}>关闭</button>
            </div>
          </div>
        </div>
      )}
      <Toast text={toast} />
    </>
  );
}
