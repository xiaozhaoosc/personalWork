import { useEffect, useState } from 'react';
import { getJson, sendJson } from '../api';

const STATUSES = ['todo', 'doing', 'done'] as const;
const STATUS_LABEL: Record<string, string> = { todo: '待办', doing: '进行中', done: '已完成' };

export default function Tasks() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState<string>('todo');

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

  return (
    <>
      <div className="page-head">
        <div><h1>任务 / 待办</h1><p>本地 SQLite 存储，独立于 WorkBuddy</p></div>
      </div>

      <div className="toolbar">
        <input placeholder="新任务标题" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <button className="btn primary" onClick={add}>添加任务</button>
      </div>

      <div className="kanban">
        {STATUSES.map((st) => (
          <div className="col" key={st}>
            <h3>{STATUS_LABEL[st]}（{tasks.filter((t) => t.status === st).length}）</h3>
            {tasks.filter((t) => t.status === st).map((t) => (
              <div className="task" key={t.id}>
                <div className="t">{t.title}</div>
                {t.project && <div className="meta">项目：{t.project}</div>}
                <div className="ops">
                  {STATUSES.filter((s) => s !== st).map((s) => (
                    <button key={s} className="btn sm" onClick={() => update(t.id, { status: s })}>→{STATUS_LABEL[s]}</button>
                  ))}
                  <button className="btn sm danger" onClick={() => del(t.id)}>删除</button>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
      {tasks.length === 0 && <div className="empty" style={{ marginTop: 16 }}>还没有任务，添加一个吧。</div>}
    </>
  );
}
