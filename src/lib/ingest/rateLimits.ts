// A job site that keeps answering 429 for days (Workday, every hour from Nov 16 to Nov 21) is paused between refreshes,
// not tried again every hour: each refresh that still finds it limiting doubles the wait, from 2 hours up to a day.
// The pause is saved in IntegrationStatus ("ratelimit:<group>") because every hourly refresh is a new process.
import type { PrismaClient } from "@prisma/client";
import { pauseOf, rateReport, setPause, type Pause } from "./http";

export const PAUSE_FIRST_HOURS = 2;
export const PAUSE_MAX_HOURS = 24;
const PREFIX = "ratelimit:";

/** Display names for the rate groups the app knows. */
export const GROUP_NAME: Record<string, string> = { "myworkdayjobs.com": "Workday", "apply.workable.com": "Workable" };
export const groupName = (g: string) => GROUP_NAME[g] ?? g;

export function pauseHours(strikes: number) {
  return Math.min(PAUSE_FIRST_HOURS * 2 ** Math.max(0, strikes - 1), PAUSE_MAX_HOURS);
}

const parse = (detail: string | null): Pause | null => {
  try {
    const p = JSON.parse(detail ?? "") as Pause;
    return Number.isFinite(p.until) && Number.isFinite(p.since) ? { until: p.until, since: p.since, strikes: p.strikes || 0 } : null;
  } catch { return null; }
};

/** Puts the saved pauses in place for this refresh. */
export async function loadPauses(db: PrismaClient) {
  const rows = await db.integrationStatus.findMany({ where: { id: { startsWith: PREFIX } } });
  const out: Record<string, Pause> = {};
  for (const r of rows) {
    const p = parse(r.detail);
    if (!p) continue;
    const group = r.id.slice(PREFIX.length);
    setPause(group, p);
    out[group] = p;
  }
  return out;
}

/** Saves what this refresh learned. A group that limited the app again gets a longer pause; one that answered without
 *  limiting is cleared. Returns the pauses that began this refresh and the groups that recovered, for one alert each. */
export async function savePauses(db: PrismaClient, before: Record<string, Pause>, now = Date.now()) {
  const { limited, served } = rateReport();
  const started: { group: string; pause: Pause }[] = [];
  const saved: Record<string, Pause> = {};
  for (const group of limited) {
    const prev = before[group];
    const strikes = (prev?.strikes ?? 0) + 1;
    const pause: Pause = { since: prev?.since ?? pauseOf(group)?.since ?? now, strikes, until: now + pauseHours(strikes) * 3600_000 };
    const detail = JSON.stringify(pause);
    await db.integrationStatus.upsert({
      where: { id: PREFIX + group },
      create: { id: PREFIX + group, name: `${groupName(group)} rate limit`, status: "paused", detail },
      update: { status: "paused", detail, checkedAt: new Date(now) },
    });
    if (!prev) started.push({ group, pause });
    saved[group] = pause;
  }
  const recovered = served.filter((g) => before[g] && !limited.includes(g));
  if (recovered.length) await db.integrationStatus.deleteMany({ where: { id: { in: recovered.map((g) => PREFIX + g) } } });
  return { started, recovered, paused: { ...Object.fromEntries(Object.entries(before).filter(([g]) => !recovered.includes(g))), ...saved } };
}
