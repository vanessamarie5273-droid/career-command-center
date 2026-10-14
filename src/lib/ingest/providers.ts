import type { AtsProvider } from "@prisma/client";
import { fetchGreenhouse } from "./greenhouse";
import { fetchLever } from "./lever";
import { fetchAshby } from "./ashby";
import { fetchSmartRecruiters } from "./smartrecruiters";
import { fetchWorkday } from "./workday";
import { BoardNotFound, type BoardResult, type FetchLike } from "./types";

export function fetchBoard(provider: AtsProvider, token: string, f: FetchLike = fetch): Promise<BoardResult> {
  switch (provider) {
    case "GREENHOUSE": return fetchGreenhouse(token, f);
    case "LEVER": return fetchLever(token, f);
    case "ASHBY": return fetchAshby(token, f);
    case "SMARTRECRUITERS": return fetchSmartRecruiters(token, f);
    case "WORKDAY": return fetchWorkday(token, f);
    default: throw new Error("No supported job feed configured");
  }
}

const PREFIX: Record<string, AtsProvider> = { greenhouse: "GREENHOUSE", lever: "LEVER", ashby: "ASHBY", smartrecruiters: "SMARTRECRUITERS", workday: "WORKDAY" };

/** Candidate (provider, token) pairs: explicit hints first, then slug variants on the public-API providers. */
export function candidates(slug: string, name: string, hints: string[]): { provider: AtsProvider; token: string }[] {
  const out: { provider: AtsProvider; token: string }[] = [];
  for (const h of hints) {
    const i = h.indexOf(":");
    if (i < 0) continue;
    const p = PREFIX[h.slice(0, i).toLowerCase()];
    if (p) out.push({ provider: p, token: h.slice(i + 1) });
  }
  if (hints.includes("none")) return out;
  const variants = [...new Set([slug, slug.replace(/-/g, ""), name.toLowerCase().replace(/[^a-z0-9]/g, "")])];
  for (const v of variants) for (const p of ["GREENHOUSE", "ASHBY", "LEVER"] as AtsProvider[]) if (!out.some((o) => o.provider === p && o.token === v)) out.push({ provider: p, token: v });
  return out;
}

export async function discoverBoard(slug: string, name: string, hints: string[], f: FetchLike = fetch) {
  const errors: string[] = [];
  for (const c of candidates(slug, name, hints)) {
    try {
      const r = await fetchBoard(c.provider, c.token, f);
      if (r.postings.length > 0 || hints.some((h) => h.toLowerCase() === `${c.provider.toLowerCase()}:${c.token.toLowerCase()}`)) return { ...c, result: r };
    } catch (e) {
      if (!(e instanceof BoardNotFound)) errors.push(`${c.provider}:${c.token} ${(e as Error).message}`);
    }
  }
  return { provider: null, token: null, result: null, errors };
}
