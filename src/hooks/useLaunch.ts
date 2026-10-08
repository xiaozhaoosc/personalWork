import { useState } from 'react';
import { sendJson } from '../api';

/** 启动技能/专家：尝试 deep-link，同时复制回退提示到剪贴板 */
export function useLaunch() {
  const [msg, setMsg] = useState('');
  async function launch(type: string, ref: string) {
    const data = await sendJson('/launch', 'POST', { type, ref });
    window.open(data.deepLink, '_blank');
    try {
      await navigator.clipboard.writeText(data.fallbackPrompt);
      setMsg('已尝试唤起 WorkBuddy，并已复制启动提示到剪贴板。\n\n' + data.fallbackPrompt);
    } catch {
      setMsg(data.fallbackPrompt);
    }
  }
  return { msg, setMsg, launch };
}
