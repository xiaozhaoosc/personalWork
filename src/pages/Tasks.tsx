import { useEffect, useRef, useState } from 'react';
import { getJson, sendJson } from '../api';

const STATUSES = ['todo', 'doing', 'done'] as const;
const STATUS_LABEL: Record<string, string> = { todo: '待办', doing: '进行中', done: '已完成' };

export default function Tasks() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState<string>('todo');
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const dragIdRef = useRef<string | null>(null);

  async function load() {
    setTasks(await getJson('/tasks'));
  }
  useEffect(() => { load(); }, []);

  async function add() {
    if (!title.trim()) return;
    await sendJson('/tasks', 'POST', { title: title.trim(), status });
    setTitle('');
    load();
  }

  async function update(id: string, patch: any) {
    await sendJson('/tasks/' + id, 'PATCH', patch);
    load();
  }
  async function del(id: string) {
    await sendJson('/tasks/' + id, 'DELETE');
    load();
  }

  /** 拖拽落点：把 dragId 的任务移动到 targetStatus 列，可指定插到 beforeId 之前；重新计算全表 order_idx */
  async function applyMove(targetStatus: string, beforeId: string | null) {
    const drag = dragIdRef.current;
    if (!drag) return;
    const rest = tasks.filter((t) => t.id !== drag);
    if (beforeId) {
      const idx = rest.findIndex((t) => t.id === beforeId);
      if (idx === -1) return;
      rest.splice(idx, 0, { id: drag, status: targetStatus });
    } else {
      rest.push({ id: drag, status: targetStatus });
    }
    const updates = rest.map((t, i) => ({ id: t.id, status: t.status, order_idx: i }));
    const updated = await sendJson('/tasks/reorder', 'POST', { updates });
    setTasks(updated);
    dragIdRef.current = null;
    setDragId(null);
    setDragOverCol(null);
  }

  function onDragStart(e: React.DragEvent, id: string) {
    dragIdRef.current = id;
    setDragId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  }

  function onDropColumn(e: React.DragEvent, st: string) {
    e.preventDefault();
    applyMove(st, null);
  }

  function onDropCard(e: React.DragEvent, t: any) {
    e.preventDefault();
    e.stopPropagation();
    if (dragIdRef.current && dragIdRef.current !== t.id) applyMove(t.status, t.id);
    else { dragIdRef.current = null; setDragId(null); setDragOverCol(null); }
  }

  return (
    <>
      <div className="page-head">
        <div><h1>任务 / 待办</h1><p>看板支持拖拽：跨列换状态、列内拖动排序；本地 SQLite 存储</p></div>
      </div>

      <div className="toolbar">
        <input placeholder="新任务标题" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <button className="btn primary" onClick={add}>添加任务</button>
      </div>

      <div className="kanban">
        {STATUSES.map((st) => {
          const colTasks = tasks.filter((t) => t.status === st);
          return (
            <div
              className="col"
              key={st}
              style={dragOverCol === st && dragId ? { outline: '2px dashed var(--primary)', outlineOffset: '-4px' } : undefined}
              onDragOver={(e) => { e.preventDefault(); setDragOverCol(st); }}
              onDragLeave={() => setDragOverCol((c) => (c === st ? null : c))}
              onDrop={(e) => onDropColumn(e, st)}
            >
              <h3>{STATUS_LABEL[st]}（{colTasks.length}）</h3>
              {colTasks.map((t) => (
                <div
                  className="task"
                  key={t.id}
                  draggable
                  onDragStart={(e) => onDragStart(e, t.id)}
                  onDragEnd={() => { dragIdRef.current = null; setDragId(null); setDragOverCol(null); }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => onDropCard(e, t)}
                  style={dragId === t.id ? { opacity: 0.45 } : undefined}
                >
                  <div className="t" style={{ cursor: 'grab' }}>{t.title}</div>
                  {t.project && <div className="meta">项目：{t.project}</div>}
                  <div className="ops">
                    {STATUSES.filter((s) => s !== st).map((s) => (
                      <button key={s} className="btn sm" onClick={() => update(t.id, { status: s })}>→{STATUS_LABEL[s]}</button>
                    ))}
                    <button className="btn sm danger" onClick={() => del(t.id)}>删除</button>
                  </div>
                </div>
              ))}
              {colTasks.length === 0 && <div className="muted" style={{ textAlign: 'center', padding: '14px 0' }}>拖拽任务到这里</div>}
            </div>
          );
        })}
      </div>
      {tasks.length === 0 && <div className="empty" style={{ marginTop: 16 }}>还没有任务，添加一个吧。</div>}
    </>
  );
}
