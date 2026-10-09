import { useEffect, useState } from 'react';
import { sendJson, getJson } from '../api';

export default function Settings() {
  const [importResult, setImportResult] = useState<any>(null);
  const [autoResult, setAutoResult] = useState<any>(null);
  const [launchInfo, setLaunchInfo] = useState<any>(null);
  const [avatarInfo, setAvatarInfo] = useState<any>(null);
  const [avatarsRemote, setAvatarsRemote] = useState(true);
  const [busy, setBusy] = useState(false);

  async function loadInfo() {
    try {
      setLaunchInfo(await getJson('/launch'));
    } catch {
      /* 忽略 */
    }
    try {
      const info = await getJson('/expert-avatars-info');
      setAvatarInfo(info);
      setAvatarsRemote(info.remoteEnabled !== false);
    } catch {
      /* 忽略 */
    }
  }

  useEffect(() => {
    loadInfo();
  }, []);

  async function doImport() {
    setBusy(true);
    try {
      setImportResult(await sendJson('/import', 'POST'));
      await loadInfo();
    } catch (e) {
      setImportResult({ warnings: [String(e)] });
    } finally {
      setBusy(false);
    }
  }

  async function refreshAuto() {
    setAutoResult(await getJson('/automations'));
  }

  async function toggleAvatars(next: boolean) {
    setAvatarsRemote(next);
    await sendJson('/prefs', 'PUT', { avatarsRemote: next ? '1' : '0' });
  }

  return (
    <>
      <div className="page-head">
        <div><h1>设置</h1><p>数据来源、启动集成、头像与备份</p></div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>启动集成（workbuddy:// 协议）</h3>
        {launchInfo ? (
          <>
            <p className="muted">
              WorkBuddy.exe：{launchInfo.available ? (
                <span className="code">{launchInfo.exePath}</span>
              ) : (
                <span>未检测到（点击启动时会回退为浏览器打开）</span>
              )}
            </p>
            <ul className="muted">
              <li>已核实可用：<code>workbuddy://experts?expertId=…</code>（可直达某位专家）、<code>workbuddy://skills?tab=installed</code>（仅已安装列表）。</li>
              <li>WorkBuddy <b>没有</b>「启动指定技能」或「注入并自动发送 prompt」的协议入口与 CLI 参数，因此启动技能 = 打开技能列表页 + 复制提示词，由你粘贴发送。</li>
            </ul>
          </>
        ) : (
          <p className="muted">正在检测…</p>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>专家头像</h3>
        <p className="muted">
          专家头像图片<b>不在本地</b>（448 条记录在磁盘上一张都没有），需从 WorkBuddy 官方 CDN 拉取，
          由本机后端代理并缓存到 <code>.cache/expert-avatars/</code>（7 天过期，上游 404 记 24 小时负缓存，总量上限 200MB）。
          任何不可用情况都会自动回退为「首字母 + 固定色相」文字头像。
        </p>
        {avatarInfo && (
          <p className="muted">
            映射条目：{avatarInfo.count} · CDN：{avatarInfo.base ? <code>{avatarInfo.base}</code> : <span>不可用（将全部使用文字头像）</span>}
          </p>
        )}
        <div className="toolbar">
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={avatarsRemote} onChange={(e) => toggleAvatars(e.target.checked)} />
            拉取远程头像图片（关闭后不发出任何网络请求，仅用文字头像）
          </label>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>数据导入</h3>
        <p className="muted">
          技能与专家数据只读镜像自 WorkBuddy 缓存（<code>.skill-list-cache.json</code> 与 <code>app/cache/experts/manifest.json</code>）。
          应用启动时会自动导入；若你在 WorkBuddy 中安装了新的技能/专家，可手动重新导入。
        </p>
        <div className="toolbar">
          <button className="btn primary" disabled={busy} onClick={doImport}>{busy ? '导入中…' : '重新导入技能/专家'}</button>
        </div>
        {importResult && (
          <div className="code">
            {`技能: ${importResult.skills ?? '?'} · 专家: ${importResult.experts ?? '?'} · 分类: ${importResult.categories ?? '?'}`}
            {importResult.warnings?.length ? '\n警告:\n' + importResult.warnings.join('\n') : '\n导入成功，无警告。'}
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>自动化镜像</h3>
        <p className="muted">
          刷新对工作区 WorkBuddy 自动化列表的只读镜像。若运行环境无法直接只读打开该库（WAL 索引受限），
          会自动改用「热备份快照」读取你自己的副本，全程不写 WorkBuddy 的数据库。
        </p>
        <div className="toolbar">
          <button className="btn" onClick={refreshAuto}>刷新自动化镜像</button>
        </div>
        {autoResult && (
          <div className="code">
            {autoResult.error
              ? '错误: ' + autoResult.error
              : `当前自动化数量: ${autoResult.rows?.length ?? 0}${autoResult.viaSnapshot ? '（经快照读取）' : ''}`}
          </div>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>备份与敏感数据</h3>
        <ul className="muted">
          <li>本应用数据全部存于本地单文件 <code>workbench.db</code>，拷贝该文件即可完整备份 / 迁移。</li>
          <li>任何密钥（API Key、支付密钥等）只应存放在 <code>.env</code> 中，该文件已被 <code>.gitignore</code> 忽略，不会进入版本库。</li>
          <li>WorkBuddy 的 <code>workbuddy.db</code> 仅以只读方式被本应用访问，绝不写回。</li>
          <li><code>.cache/</code> 为头像缓存与只读快照，可随时删除后自动重建。</li>
        </ul>
      </div>
    </>
  );
}
