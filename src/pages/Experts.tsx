import { useEffect, useState } from 'react';
import { getJson, sendJson } from '../api';

interface FilterOpts {
  categoryId?: string;
  query?: string;
  isOpc?: boolean;
}

export default function Experts() {
  const [cats, setCats] = useState<any[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [activeCat, setActiveCat] = useState('');
  const [q, setQ] = useState('');
  const [isOpc, setIsOpc] = useState(false);
  const [sel, setSel] = useState<any>(null);
  const [msg, setMsg] = useState('');

  // 显式传参，避免 stale closure：opts 优先于当前 state
  async function load(opts?: FilterOpts) {
    const query = opts?.query ?? q;
    const categoryId = opts?.categoryId ?? activeCat;
    const opc = opts?.isOpc ?? isOpc;
    const params = new URLSearchParams();
    if (query) params.set('query', query);
    if (categoryId) params.set('categoryId', categoryId);
    if (opc) params.set('isOpc', '1');
    setRows(await getJson('/experts?' + params.toString()));
  }

  useEffect(() => {
    getJson('/expert-categories').then(setCats).catch(() => {});
    load();
  }, []);

  function switchCat(id: string) {
    setActiveCat(id);
    load({ categoryId: id });
  }

  function toggleOpc(checked: boolean) {
    setIsOpc(checked);
    load({ isOpc: checked });
  }

  async function openDetail(id: string) {
    setSel(await getJson('/experts/' + encodeURIComponent(id)));
  }

  function launch(ref: string) {
    sendJson('/launch', 'POST', { type: 'expert', ref }).then((data) => {
      window.open(data.deepLink, '_blank');
      navigator.clipboard?.writeText(data.fallbackPrompt).catch(() => {});
      setMsg(data.fallbackPrompt);
    });
  }

  return (
    <>
      <div className="page-head">
        <div><h1>专家目录</h1><p>已匹配 {rows.length} 位专家（共 {cats.length} 个分类）</p></div>
      </div>

      <div className="toolbar">
        <input type="search" placeholder="搜索姓名 / 职业 / 描述" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="checkbox" checked={isOpc} onChange={(e) => toggleOpc(e.target.checked)} /> 仅 OPC
        </label>
        <button className="btn primary" onClick={() => load()}>搜索</button>
      </div>

      <div style={{ display: 'flex', gap: 16 }}>
        <aside style={{ width: 180, flexShrink: 0 }} className="card" >
          <div className="row-item" style={{ cursor: 'pointer', background: activeCat === '' ? 'var(--primary-weak)' : '#fff' }} onClick={() => switchCat('')}>
            <div className="title">全部分类</div>
          </div>
          {cats.map((c) => (
            <div key={c.id} className="row-item" style={{ cursor: 'pointer', background: activeCat === c.id ? 'var(--primary-weak)' : '#fff' }} onClick={() => switchCat(c.id)}>
              <div className="title">{c.name_zh || c.id}</div>
            </div>
          ))}
        </aside>

        <div style={{ flex: 1 }}>
          <div className="list">
            {rows.map((e) => (
              <div key={e.id} className="row-item" onClick={() => openDetail(e.id)}>
                <div style={{ flex: 1 }}>
                  <div className="title">{e.display_name_zh || e.display_name_en}</div>
                  <div className="meta">{e.profession_zh || ''}</div>
                </div>
                {e.is_opc ? <span className="tag blue">OPC</span> : null}
              </div>
            ))}
            {rows.length === 0 && <div className="empty">没有匹配的专家</div>}
          </div>
        </div>
      </div>

      {sel && (
        <div className="modal-mask" onClick={() => setSel(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button className="close" onClick={() => setSel(null)}>×</button>
            <h2>{sel.display_name_zh || sel.display_name_en}</h2>
            <div className="meta">{sel.profession_zh || sel.profession_en} · {sel.expert_type || ''}</div>
            <p>{sel.description_zh || sel.description_en || '（无描述）'}</p>
            {sel.default_init_prompt_zh && (<><strong>初始化提示：</strong><div className="code">{sel.default_init_prompt_zh}</div></>)}
            {sel.quick_prompts_zh && (
              <div style={{ marginTop: 8 }}>
                <strong>快捷提示：</strong>
                <div className="code">{(() => { try { return JSON.parse(sel.quick_prompts_zh).join('\n'); } catch { return ''; } })()}</div>
              </div>
            )}
            <div className="toolbar" style={{ marginTop: 14 }}>
              <button className="btn primary" onClick={() => launch(sel.id)}>开启专家对话</button>
              {sel.agent_name && <span className="muted">agent: {sel.agent_name}</span>}
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
            <div className="toolbar" style={{ marginTop: 12 }}><button className="btn" onClick={() => setMsg('')}>关闭</button></div>
          </div>
        </div>
      )}
    </>
  );
}
