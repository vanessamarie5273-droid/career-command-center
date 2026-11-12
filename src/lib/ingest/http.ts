import type { FetchLike } from "./types";
import { BoardNotFound } from "./types";

export const UA = "CareerCommandCenter/1.0 (personal job search; first-party ATS job board API)";

/** Hosts that rate-limit by caller: calls to them are spaced out instead of fired back to back.
 *  Workable answers 429 when a refresh reads several of its boards, or probes it for many companies, in a row. */
export const HOST_SPACING_MS: Record<string, number> = { "apply.workable.com": 2500 };
const nextSlot = new Map<string, number>();
async function waitTurn(url: string) {
  const host = (() => { try { return new URL(url).host; } catch { return ""; } })();
  const gap = process.env.VITEST ? 0 : HOST_SPACING_MS[host]; // tests use canned responses: no rate limit to respect
  if (!gap) return;
  const now = Date.now();
  const at = Math.max(now, nextSlot.get(host) ?? 0);
  nextSlot.set(host, at + gap);
  if (at > now) await new Promise((r) => setTimeout(r, at - now));
}

/** How long to wait after a 429: the server's Retry-After (capped), or a backoff long enough for a rate window to pass. */
export function retryDelay(res: Response | null, attempt: number) {
  const ra = Number(res?.headers.get("retry-after"));
  if (Number.isFinite(ra) && ra > 0) return Math.min(ra, 30) * 1000;
  return 5000 * 2 ** attempt;
}

export async function getJson<T>(f: FetchLike, url: string, init: RequestInit = {}, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    let limited: Response | null = null;
    try {
      await waitTurn(url);
      const res = await f(url, { ...init, headers: { "User-Agent": UA, Accept: "application/json", ...(init.headers || {}) }, signal: AbortSignal.timeout(25000) });
      if (res.status === 404) throw new BoardNotFound(`404 ${url}`);
      if (res.status === 429) { limited = res; throw new Error(`HTTP 429 ${url}`); }
      if (res.status >= 500) throw new Error(`HTTP ${res.status} ${url}`);
      if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
      return (await res.json()) as T;
    } catch (e) {
      if (e instanceof BoardNotFound) throw e;
      lastErr = e;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, limited ? retryDelay(limited, i) : 500 * 2 ** i));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
