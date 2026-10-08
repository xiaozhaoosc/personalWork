import { useState } from 'react';
import { sendJson, getJson } from '../api';

export default function Settings() {
  const [importResult, setImportResult] = useState<any>(null);
  const [autoResult, setAutoResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  async function doImport() {
    setBusy(true);
    try {
      setImportResult(await sendJson('/import', 'POST'));
    } catch (e) {
      setImportResult({ warnings: [String(e)] });
    } finally {
      setBusy(false);
    }
  }

  async function refreshAuto() {
    setAutoResult(await getJson('/automations'));
  }

  return (
    <>
      <div className="page-head">
        <div><h1>设置</h1><p>数据来源、导入与备份</p></div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>数据导入</h3>
        <p className="muted">
          技能与专家数据只读镜像自 WorkBuddy 缓存（<code>.skill-list-cache.json</code> 与 <code>app/cache/experts/manifest.json</code>）。
          应用启动时会自动导入；若你在 WorkBuddy 中安装了新的技能/专家，可手动重新导入。
        </p>
        <div className="toolbar">
          <button className="btn primary" disabled={busy} onClick={doImport}>重新导入技能/专家</button>
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
        <p className="muted">刷新对工作区 WorkBuddy 自动化列表的只读镜像。</p>
        <div className="toolbar">
          <button className="btn" onClick={refreshAuto}>刷新自动化镜像</button>
        </div>
        {autoResult && (
          <div className="code">
            {autoResult.error ? '错误: ' + autoResult.error : `当前自动化数量: ${autoResult.rows?.length ?? 0}`}
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>备份与敏感数据</h3>
        <ul className="muted">
          <li>本应用数据全部存于本地单文件 <code>workbench.db</code>，拷贝该文件即可完整备份 / 迁移。</li>
          <li>任何密钥（API Key、支付密钥等）只应存放在 <code>.env</code> 中，该文件已被 <code>.gitignore</code> 忽略，不会进入版本库。</li>
          <li>WorkBuddy 的 <code>workbuddy.db</code> 仅以只读方式被本应用访问，绝不被写入。</li>
        </ul>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>启动集成（deep-link）</h3>
        <p className="muted">
          在技能/专家详情页点击「启动」会尝试通过 <code>workbuddy://</code> 协议唤起 WorkBuddy。若系统未注册该协议，
          应用会自动把启动提示复制到剪贴板，粘贴到 WorkBuddy 窗口即可开始。（具体协议以 WorkBuddy 实际支持为准。）
        </p>
      </div>
    </>
  );
}
