const BASE = '/api';

export async function getJson<T = any>(path: string): Promise<T> {
  const r = await fetch(BASE + path);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function sendJson(
  path: string,
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  body?: any
): Promise<any> {
  const r = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(await r.text());
  return r.status === 204 ? null : r.json();
}
