import type { FetchLike } from "./types";
import { BoardNotFound } from "./types";

export const UA = "CareerCommandCenter/1.0 (personal job search; first-party ATS job board API)";

export async function getJson<T>(f: FetchLike, url: string, init: RequestInit = {}, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await f(url, { ...init, headers: { "User-Agent": UA, Accept: "application/json", ...(init.headers || {}) }, signal: AbortSignal.timeout(25000) });
      if (res.status === 404) throw new BoardNotFound(`404 ${url}`);
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status} ${url}`);
      if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
      return (await res.json()) as T;
    } catch (e) {
      if (e instanceof BoardNotFound) throw e;
      lastErr = e;
      await new Promise((r) => setTimeout(r, 500 * 2 ** i));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
