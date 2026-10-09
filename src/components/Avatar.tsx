import { useState } from 'react';

/**
 * FNV-1a：短 id 上比原生 JS 字符串 hash 更均匀（后者分布有偏）。
 * 同一专家每次取到相同色相，跨刷新/跨列表位置保持稳定。
 */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export interface AvatarProps {
  expertId: string;
  name?: string | null;
  /** experts.avatar 原始路径；/plugins/ 开头在 CDN 上已确认 404 */
  avatarPath?: string | null;
  expertType?: string | null;
  size?: number;
  remoteEnabled?: boolean;
}

/**
 * 专家头像：优先显示真实头像（经后端白名单代理缓存），
 * 任何不可用情况都优雅回退到「首字母 + 固定色相」文字头像。
 */
export default function Avatar({
  expertId,
  name,
  avatarPath,
  expertType,
  size = 40,
  remoteEnabled = true,
}: AvatarProps) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  // 开关关闭 / 无头像路径 / 已知 404 的 /plugins/ 路径 → 完全不发请求
  const useRemote = remoteEnabled && !!avatarPath && !avatarPath.startsWith('/plugins/');

  // Array.from 保证 emoji 等代理对字符不被截成半个
  const ch = Array.from((name || '?').trim())[0] || '?';
  const hue = fnv1a(expertId) % 360;
  const shape = expertType === 'team' ? '22%' : '50%';
  const fallbackStyle = {
    width: size,
    height: size,
    fontSize: Math.round(size * 0.42),
    background: `hsl(${hue}, 62%, 92%)`,
    color: `hsl(${hue}, 58%, 34%)`,
    borderRadius: shape,
  };

  return (
    <span className="avatar" style={{ width: size, height: size }}>
      <span className="avatar-fallback" style={fallbackStyle}>
        {ch}
      </span>
      {useRemote && !failed && loaded && (
        <img
          className="avatar-img"
          src={`/api/expert-avatars/${encodeURIComponent(expertId)}`}
          alt={name || ''}
          width={size}
          height={size}
          style={{ borderRadius: shape }}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      )}
      {useRemote && !failed && !loaded && (
        <img
          className="avatar-img avatar-img-loading"
          src={`/api/expert-avatars/${encodeURIComponent(expertId)}`}
          alt=""
          aria-hidden
          width={size}
          height={size}
          style={{ borderRadius: shape }}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}
