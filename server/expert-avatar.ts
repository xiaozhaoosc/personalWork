import type { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, copyFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

export const AVATAR_TTL_MS = 7 * 24 * 3600 * 1000; // 7 天
export const AVATAR_NEG_TTL_MS = 24 * 3600 * 1000; // 上游 404 的负缓存 24 小时
export const AVATAR_TIMEOUT_MS = 5000;
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024; // 单张上限 2MB
export const CACHE_MAX_BYTES = 200 * 1024 * 1024; // 缓存总量上限 200MB
export const PRUNE_AGE_MS = 30 * 24 * 3600 * 1000; // 30 天以上清理

/** 仅允许这些扩展名与路径形态，杜绝穿越与任意协议 */
const AVATAR_PATH_RE = /^\/(avatars|plugins)\/[A-Za-z0-9._\/-]+\.(png|jpe?g)$/i;
const ALLOWED_CONTENT_TYPES = new Set(['image/png', 'image/jpeg']);

/**
 * 读取专家头像 CDN 的 base URL。
 * 优先级：env 覆盖 → metadata.json 的 sourceSignature。
 * 注意：sourceSignature 在该文件里是**嵌套的 JSON 字符串**（需二次 parse）。
 */
export function readCdnBaseUrl(userDir: string, envOverride?: string | null): string | null {
  const override = envOverride ?? process.env.WORKBUDDY_EXPERT_CDN_BASE;
  if (override && /^https:\/\//i.test(override)) return override.replace(/\/+$/, '');

  const p = join(userDir, 'app', 'cache', 'experts', 'metadata.json');
  try {
    if (!existsSync(p)) return null;
    const raw = JSON.parse(readFileSync(p, 'utf8')) as any;
    let sig = raw?.sourceSignature;
    if (typeof sig === 'string') {
      try {
        sig = JSON.parse(sig);
      } catch {
        return null;
      }
    }
    if (!sig || typeof sig !== 'object') return null;
    const base = sig.baseUrl;
    if (typeof base !== 'string' || !/^https:\/\//i.test(base)) return null;
    return base.replace(/\/+$/, '');
  } catch {
    return null;
  }
}

/**
 * 构造 id → 完整远程 URL 的白名单映射。
 * 必须**字符串拼接**：avatar 以 `/` 开头，用 new URL() 会抹掉 base 的路径段导致 403。
 */
export function buildAvatarUrlMap(db: DatabaseSync, base: string | null): Map<string, string> {
  const map = new Map<string, string>();
  if (!base) return map;
  const rows = db
    .prepare('SELECT id, avatar FROM experts WHERE avatar IS NOT NULL AND TRIM(avatar) <> \'\'')
    .all() as any[];
  for (const r of rows) {
    const a = String(r.avatar);
    if (a.includes('..')) continue;
    if (/^[a-z]+:\/\//i.test(a)) continue; // 拒绝绝对 URL
    if (!AVATAR_PATH_RE.test(a)) continue;
    map.set(r.id, base + a);
  }
  return map;
}

export interface AvatarProxy {
  handle(req: any, res: any): Promise<void>;
  refresh(): void;
  describe(): Record<string, unknown>;
}

export interface AvatarProxyOptions {
  db: DatabaseSync;
  userDir: string;
  cacheDir: string;
  /** 读取偏好：返回 false 时完全不发网络请求 */
  isRemoteEnabled: () => boolean;
  cdnBaseOverride?: string | null;
  fetchImpl?: typeof fetch;
}

export function createExpertAvatarProxy(opts: AvatarProxyOptions): AvatarProxy {
  const { db, cacheDir, isRemoteEnabled } = opts;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const dir = join(cacheDir, 'expert-avatars');
  let map = new Map<string, string>();
  let base: string | null = null;

  function cacheKey(id: string, avatarPath: string): string {
    const h = createHash('sha1').update(`${id}\0${avatarPath}`).digest('hex');
    return h;
  }

  function ensureDir() {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  /** 清理孤儿与超期文件，并按 mtime 淘汰使总量回落到上限的 80% */
  function maintain() {
    try {
      ensureDir();
      const now = Date.now();
      const files = readdirSync(dir);
      const images: { name: string; size: number; mtime: number }[] = [];
      for (const f of files) {
        const fp = join(dir, f);
        const st = statSync(fp);
        if (now - st.mtimeMs > PRUNE_AGE_MS) {
          try {
            unlinkSync(fp);
          } catch {
            /* 忽略 */
          }
          continue;
        }
        // 孤儿判定：有图无 meta / 有 neg 无图
        const hasMeta = files.includes(`${f}.meta`);
        const hasNeg = files.includes(`${f}.neg`);
        if (f.endsWith('.meta') || f.endsWith('.neg')) continue;
        if (!hasMeta && !hasNeg) {
          try {
            unlinkSync(fp);
          } catch {
            /* 忽略 */
          }
          continue;
        }
        if (!hasMeta && hasNeg) {
          try {
            unlinkSync(fp);
          } catch {
            /* 忽略 */
          }
          continue;
        }
        images.push({ name: f, size: st.size, mtime: st.mtimeMs });
      }
      let total = images.reduce((a, b) => a + b.size, 0);
      if (total > CACHE_MAX_BYTES) {
        images.sort((a, b) => a.mtime - b.mtime);
        for (const img of images) {
          if (total <= CACHE_MAX_BYTES * 0.8) break;
          try {
            unlinkSync(join(dir, img.name));
            for (const ext of ['.meta', '.neg']) {
              try {
                unlinkSync(join(dir, img.name + ext));
              } catch {
                /* 忽略 */
              }
            }
            total -= img.size;
          } catch {
            /* 忽略 */
          }
        }
      }
    } catch {
      /* 维护失败不影响服务 */
    }
  }

  function refresh() {
    base = readCdnBaseUrl(opts.userDir, opts.cdnBaseOverride);
    map = buildAvatarUrlMap(db, base);
    maintain();
  }

  function sendImage(res: any, buf: Buffer, contentType: string, cacheState: string) {
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.setHeader('X-Cache', cacheState);
    res.status(200).end(buf);
  }

  async function handle(req: any, res: any) {
    const id = String(req.params?.id ?? '');
    if (!isRemoteEnabled()) {
      return res.status(404).json({ error: 'avatars disabled' });
    }
    const url = map.get(id);
    if (!url) return res.status(404).json({ error: 'not found' });

    const avatarRow = db.prepare('SELECT avatar FROM experts WHERE id = ?').get(id) as any;
    const key = cacheKey(id, String(avatarRow?.avatar ?? url));
    const imgPath = join(dir, key);
    const metaPath = `${imgPath}.meta`;
    const negPath = `${imgPath}.neg`;

    // 磁盘命中
    try {
      if (existsSync(metaPath) && existsSync(imgPath)) {
        const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
        if (Date.now() - Number(meta.fetchedAt) < AVATAR_TTL_MS) {
          return sendImage(res, readFileSync(imgPath), meta.contentType || 'image/png', 'hit');
        }
      }
      // 负缓存
      if (existsSync(negPath)) {
        const neg = JSON.parse(readFileSync(negPath, 'utf8'));
        if (Date.now() - Number(neg.failedAt) < AVATAR_NEG_TTL_MS) {
          res.setHeader('X-Cache', 'neg');
          return res.status(404).json({ error: 'not found' });
        }
      }
    } catch {
      /* 缓存损坏则回源 */
    }

    // 回源
    let upstream: Response;
    try {
      upstream = await fetchImpl(url, { signal: AbortSignal.timeout(AVATAR_TIMEOUT_MS) });
    } catch (e) {
      // 超时/网络错误不写负缓存，以便下次自愈
      return res.status(502).json({ error: `avatar upstream failed: ${(e as Error).message}` });
    }

    if (!upstream.ok) {
      if (upstream.status === 404 || upstream.status === 403) {
        try {
          ensureDir();
          writeFileSync(negPath, JSON.stringify({ failedAt: Date.now() }));
        } catch {
          /* 忽略 */
        }
        return res.status(404).json({ error: 'not found' });
      }
      return res.status(502).json({ error: `avatar upstream status ${upstream.status}` });
    }

    const ctype = (upstream.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!ALLOWED_CONTENT_TYPES.has(ctype)) {
      // 例如 CDN 返回了 HTML 错误页：绝不缓存、也不当图片返回
      return res.status(502).json({ error: `unexpected content-type ${ctype}` });
    }
    const declared = Number(upstream.headers.get('content-length') || '0');
    if (declared && declared > AVATAR_MAX_BYTES) {
      return res.status(502).json({ error: 'avatar too large' });
    }

    let buf: Buffer;
    try {
      buf = Buffer.from(await upstream.arrayBuffer());
    } catch (e) {
      return res.status(502).json({ error: `avatar read failed: ${(e as Error).message}` });
    }
    if (buf.length > AVATAR_MAX_BYTES) {
      return res.status(502).json({ error: 'avatar too large' });
    }

    try {
      ensureDir();
      writeFileSync(imgPath, buf);
      writeFileSync(
        metaPath,
        JSON.stringify({ url, fetchedAt: Date.now(), contentType: ctype, bytes: buf.length })
      );
      try {
        unlinkSync(negPath);
      } catch {
        /* 忽略 */
      }
    } catch {
      /* 缓存写入失败不影响本次返回 */
    }
    return sendImage(res, buf, ctype, 'miss');
  }

  function describe() {
    return { base, count: map.size, cacheDir: dir };
  }

  refresh();
  return { handle, refresh, describe };
}
