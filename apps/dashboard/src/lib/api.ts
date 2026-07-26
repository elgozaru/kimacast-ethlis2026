/// Thin fetch wrapper for dashboard-api. `/api/*` is relative on purpose -
/// vite.config.ts's dev proxy forwards it, same reasoning as apps/web (see
/// its vite.config.ts comment): no CORS, no "which forwarded hostname is
/// the API on" logic needed.
export async function apiFetch<T>(
  path: string,
  accessToken: string,
  init?: RequestInit & { json?: unknown },
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    method: init?.method ?? (init?.json ? "POST" : "GET"),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.json ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    body: init?.json ? JSON.stringify(init.json) : init?.body,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${path} -> ${res.status}: ${body}`);
  }
  return res.json();
}
