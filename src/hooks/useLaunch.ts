import { useState } from 'react';
import { sendJson } from '../api';

/**
 * 启动技能 / 专家。
 *
 * 后端会优先用 spawn 唤起 WorkBuddy（workbuddy://experts?expertId=… 这类已验证路由），
 * 但 WorkBuddy 没有"注入并自动发送 prompt"的入口，因此提示词仍需用户粘贴。
 * 成功唤起且剪贴板可用时只给短暂提示（不再每次弹窗）；
 * 降级或剪贴板失败时才展示完整文本。
 */
export function useLaunch() {
  const [msg, setMsg] = useState('');
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);

  async function launch(type: string, ref: string) {
    if (busy) return;
    setBusy(true);
    try {
      const d = await sendJson('/launch', 'POST', { type, ref });

      let copied = false;
      try {
        await navigator.clipboard.writeText(d.fallbackPrompt);
        copied = true;
      } catch {
        /* 剪贴板不可用 */
      }

      if (d.mode === 'spawned' && copied) {
        setToast('已在 WorkBuddy 打开，启动提示已复制到剪贴板');
        setTimeout(() => setToast(''), 2500);
      } else {
        if (d.mode === 'url-only') {
          try {
            window.open(d.url, '_blank');
          } catch {
            /* 浏览器可能拦截自定义协议 */
          }
        }
        const head =
          d.mode === 'spawned'
            ? '已在 WorkBuddy 打开对应页面。'
            : '未检测到 WorkBuddy.exe（可在设置页查看路径），已尝试用浏览器打开。';
        const copyHint = copied ? '启动提示已复制到剪贴板' : '启动提示（剪贴板不可用，请手动复制）';
        setMsg(`${head}\n\n${copyHint}：\n\n${d.fallbackPrompt}`);
      }
    } catch (e) {
      setMsg('启动失败：' + String(e));
    } finally {
      setBusy(false);
    }
  }

  return { msg, setMsg, toast, setToast, launch, busy };
}
