import type { Company, Job, PrismaClient } from "@prisma/client";
import { classifyTitle, isRelevantFamily } from "../roles";
import { htmlToText, parseCompensation, parseLocation, parseYearsRequired, requiresClearance, splitQualifications, extractTravel, extractRelocation, extractTerritory } from "../normalize";
import { jobFingerprint, contentHash } from "../dedupe";
import { findSameReq, mergeDuplicateJobs } from "../jobMerge";
import { scoreJob } from "../scoring";
import { fetchBoard, discoverBoard } from "./providers";
import { workdayPath, type KnownWorkdayJob } from "./workday";
import { BoardNotFound, RateLimited, type FetchLike, type RawPosting } from "./types";
import { isPaused, pauseOf, resetRateLimits } from "./http";
import { groupName, loadPauses, savePauses } from "./rateLimits";
import { date, dateTime, range } from "../format";
import { runGoogleJobs } from "./googleJobs";

export type CompanyOutcome = { company: string; status: "ok" | "error" | "not_found" | "unsupported" | "pending" | "paused" | "skipped"; fetched: number; relevant: number; created: number; updated: number; closed: number; error?: string };

export function buildJobData(company: Pick<Company, "id">, p: RawPosting) {
  const text = p.descriptionText || htmlToText(p.descriptionHtml);
  const loc = parseLocation(p.location, { remoteFlag: p.isRemote, workplaceType: p.workplaceType, text });
  const parsed = parseCompensation(text);
  const comp = {
    salaryMin: p.comp?.salaryMin ?? parsed.salaryMin ?? null,
    salaryMax: p.comp?.salaryMax ?? parsed.salaryMax ?? null,
    oteMin: p.comp?.oteMin ?? parsed.oteMin ?? null,
    oteMax: p.comp?.oteMax ?? parsed.oteMax ?? null,
  };
  const hasComp = Object.values(comp).some((v) => v != null);
  const quals = splitQualifications(text);
  const cls = classifyTitle(p.title);
  return {
    fingerprint: jobFingerprint(company.id, p.title, p.location),
    title: p.title,
    department: p.department ?? null,
    description: p.descriptionHtml ?? null,
    descriptionText: text || null,
    location: p.location ?? null,
    workArrangement: loc.arrangement,
    isRemote: loc.isRemote,
    isUS: loc.isUS,
    territory: extractTerritory(p.title, text) ?? null,
    postedAt: p.postedAt && !isNaN(p.postedAt.getTime()) ? p.postedAt : null,
    applyUrl: p.applyUrl,
    ...comp,
    compText: p.comp?.summary || parsed.text || null,
    compFactType: hasComp ? ("CONFIRMED" as const) : null,
    equityMentioned: !!p.comp?.equity || /\b(equity|rsus?|stock options?|ownership)\b/i.test(text),
    commissionNotes: (text.match(/[^.\n]{0,60}\b(commission|variable compensation|accelerators?|spiffs?)\b[^.\n]{0,100}/i)?.[0] || "").trim() || null,
    seniority: cls.seniority,
    roleFamily: cls.family,
    yearsRequired: parseYearsRequired(text) ?? null,
    requiresClearance: requiresClearance(text),
    travelNotes: extractTravel(text) ?? null,
    relocationNotes: extractRelocation(text) ?? null,
    requiredQuals: quals.required ?? null,
    preferredQuals: quals.preferred ?? null,
  };
}

export function applyScore(data: ReturnType<typeof buildJobData>, company: Company, firstSeenAt?: Date) {
  // firstSeenAt dates the age limit for boards that publish no posted date, the same way the rescore does.
  const s = scoreJob({ ...data, firstSeenAt, company });
  return { score: s.score, scoreBreakdown: s.breakdown, scoreReasons: s.reasons, confidence: s.confidence, tier: s.tier, category: s.category, excludedReason: s.excludedReason ?? null };
}

type Comparable = { title: string; location: string | null; salaryMin: number | null; salaryMax: number | null; oteMin: number | null; oteMax: number | null; requiredQuals: string | null; preferredQuals: string | null; travelNotes: string | null; requiresClearance: boolean };
const pay = (j: Pick<Comparable, "salaryMin" | "salaryMax" | "oteMin" | "oteMax">) => {
  const ote = range(j.oteMin, j.oteMax), base = range(j.salaryMin, j.salaryMax);
  return ote ? `${ote} OTE` : base;
};
const squash = (s: string | null) => (s ?? "").replace(/\s+/g, " ").trim().toLowerCase();

/** What a re-fetch changed that she would care about, in plain words, for the briefing's "changes to tracked jobs". */
export function jobChanges(old: Comparable, next: Comparable): string[] {
  const out: string[] = [];
  const a = pay(old), b = pay(next);
  if (!a && b) out.push(`Pay now published: ${b}`);
  else if (a && b && a !== b) out.push(`Pay changed: ${a} → ${b}`);
  else if (a && !b) out.push("Pay range removed from the posting");
  if (squash(old.requiredQuals) !== squash(next.requiredQuals) && (old.requiredQuals || next.requiredQuals)) out.push("Required qualifications revised");
  if (squash(old.preferredQuals) !== squash(next.preferredQuals) && (old.preferredQuals || next.preferredQuals)) out.push("Preferred qualifications revised");
  if (squash(old.title) !== squash(next.title)) out.push(`Title changed: ${old.title} → ${next.title}`);
  if (squash(old.location) !== squash(next.location)) out.push(`Location changed: ${old.location ?? "none"} → ${next.location ?? "none"}`);
  if (squash(old.travelNotes) !== squash(next.travelNotes) && next.travelNotes) out.push(`Travel now listed: ${next.travelNotes.slice(0, 80)}`);
  if (!old.requiresClearance && next.requiresClearance) out.push("Now requires a security clearance");
  return out;
}

/** Persist one posting with cross-source deduplication. Returns what happened. */
export async function upsertPosting(db: PrismaClient, company: Company, p: RawPosting, now: Date): Promise<"created" | "updated" | "verified"> {
  let data = buildJobData(company, p);
  const existingSource = await db.jobSource.findUnique({ where: { provider_externalId: { provider: p.provider, externalId: p.externalId } }, include: { job: true } });
  // Not seen from this source before: the same opening may already be saved from another source, under another spelling.
  const job = existingSource?.job ?? (await db.job.findUnique({ where: { fingerprint: data.fingerprint } })) ?? (await findSameReq(db, company.id, p, now));
  // A description call that failed this time (timeout, rate limit) must not wipe the description saved last time.
  if (job && !p.descriptionHtml && !p.descriptionText && (job.description || job.descriptionText)) {
    data = buildJobData(company, { ...p, descriptionHtml: job.description, descriptionText: job.descriptionText });
  }
  // A Google Jobs result for a role the employer's own board already lists only counts as another sighting:
  // the employer's posting keeps its link and full description.
  if (job && p.provider === "GOOGLE_JOBS" && (await db.jobSource.count({ where: { jobId: job.id, provider: { not: "GOOGLE_JOBS" } } }))) {
    if (existingSource) await db.jobSource.update({ where: { id: existingSource.id }, data: { lastSeenAt: now } });
    else await db.jobSource.create({ data: { jobId: job.id, provider: p.provider, externalId: p.externalId, url: p.applyUrl, firstSeenAt: now, lastSeenAt: now } });
    return "verified";
  }
  const scored = applyScore(data, company, job?.firstSeenAt ?? now);
  if (!job) {
    const created = await db.job.create({
      data: { ...data, ...scored, companyId: company.id, firstSeenAt: now, lastVerifiedAt: now, sources: { create: { provider: p.provider, externalId: p.externalId, url: p.applyUrl, firstSeenAt: now, lastSeenAt: now } }, events: { create: { kind: "discovered", detail: `Found on ${p.provider} board`, at: now } } },
    });
    void created;
    return "created";
  }
  const changed = contentHash(`${job.title}|${job.descriptionText}|${job.location}|${job.applyUrl}`) !== contentHash(`${data.title}|${data.descriptionText}|${data.location}|${data.applyUrl}`);
  const reopened = job.status === "CLOSED";
  // Keep the fingerprint of the canonical record when merging a second source.
  const { fingerprint: _fp, ...rest } = data;
  void _fp;
  await db.job.update({ where: { id: job.id }, data: { ...rest, ...scored, status: "OPEN", closedAt: null, lastVerifiedAt: now } });
  if (existingSource) await db.jobSource.update({ where: { id: existingSource.id }, data: { lastSeenAt: now, url: p.applyUrl } });
  else await db.jobSource.create({ data: { jobId: job.id, provider: p.provider, externalId: p.externalId, url: p.applyUrl, firstSeenAt: now, lastSeenAt: now } });
  const diffs = jobChanges(job, data);
  const detail = [reopened ? "Reposted after being taken down" : null, ...diffs, existingSource ? null : `Merged duplicate from ${p.provider}`].filter(Boolean).join("; ") || undefined;
  await db.jobEvent.create({ data: { jobId: job.id, kind: reopened ? "reopened" : changed || diffs.length ? "updated" : "verified", detail, at: now } });
  return changed || reopened || diffs.length ? "updated" : "verified";
}

/** Close jobs from this company's job board not seen in a successful fetch. Never called after a failed fetch.
 *  Jobs read from a board the company no longer uses (Mistral moved from Lever to Ashby) close too, once the new board
 *  has been read and they were not on it. Google Jobs results close on their own schedule. */
export async function closeMissing(db: PrismaClient, companyId: string, provider: string, runStart: Date, now: Date) {
  const stale = await db.job.findMany({
    where: { companyId, status: "OPEN", manual: false, sources: { some: { provider: { not: "GOOGLE_JOBS" } } } },
    include: { sources: true },
  });
  let closed = 0;
  for (const j of stale) {
    const seenThisRun = j.sources.some((s) => s.lastSeenAt >= runStart);
    if (seenThisRun) continue;
    await db.job.update({ where: { id: j.id }, data: { status: "CLOSED", closedAt: now } });
    const moved = !j.sources.some((x) => x.provider === provider);
    await db.jobEvent.create({ data: { jobId: j.id, kind: "closed", detail: moved ? `Not on the company's current ${provider} board` : `No longer listed on ${provider} board`, at: now } });
    closed++;
  }
  return closed;
}

/** Saved Workday roles for this company, so a refresh only fetches descriptions for roles it has not seen. */
async function knownWorkdayJobs(db: PrismaClient, companyId: string) {
  // Roles saved without a description are listed too, so the next read keeps their id (a role first read while its
  // details call was rate limited used to come back under its req id as a second, "new" copy).
  const sources = await db.jobSource.findMany({ where: { provider: "WORKDAY", job: { companyId } }, select: { externalId: true, url: true, job: { select: { location: true, postedAt: true, isRemote: true, description: true, descriptionText: true } } } });
  const known = new Map<string, KnownWorkdayJob>();
  for (const s of sources) {
    const path = s.url ? workdayPath(s.url) : null;
    const described = !!(s.job.description || s.job.descriptionText);
    if (path && (described || !known.has(path))) known.set(path, { externalId: s.externalId, location: s.job.location, applyUrl: s.url!, postedAt: s.job.postedAt, isRemote: s.job.isRemote, described });
  }
  return known;
}

/** Providers whose boards all share one rate limit (rateGroup in http.ts). */
export const PROVIDER_GROUP: Partial<Record<string, string>> = { WORKDAY: "myworkdayjobs.com" };
const providerName = (p: string) => `${p[0]}${p.slice(1).toLowerCase()}`;

export async function ingestCompany(db: PrismaClient, listed: Company, f: FetchLike = fetch, runStart = new Date(), opts: { scheduled?: boolean; workdayBudget?: { left: number } } = {}): Promise<CompanyOutcome> {
  const out: CompanyOutcome = { company: listed.name, status: "ok", fetched: 0, relevant: 0, created: 0, updated: 0, closed: 0 };
  // A refresh lists its companies when it starts. One can be merged into another or removed before its turn comes
  // (the deploy that merges duplicates ran while the 11 AM refresh was going, Nov 18): skip it, never fail the run.
  const company = await db.company.findUnique({ where: { id: listed.id } });
  if (!company) return { ...out, status: "skipped", error: "Company was merged or removed during the refresh" };
  let provider = company.atsProvider;
  let token = company.atsToken;
  try {
    if (provider === "NONE" || !token) {
      if (company.atsHints.includes("none")) {
        await db.company.update({ where: { id: company.id }, data: { atsStatus: "unsupported", atsCheckedAt: new Date(), atsError: "Careers site has no public job API; monitored via direct careers link" } });
        return { ...out, status: "unsupported" };
      }
      // A company with no public board was probed recently: don't spend 15 lookups on it every hour.
      const since = company.atsCheckedAt ? runStart.getTime() - company.atsCheckedAt.getTime() : Infinity;
      if (company.atsStatus === "not_found" && since < REPROBE_DAYS * 86400_000) return { ...out, status: "not_found" };
      // A lookup cut short by a rate limit or an outage is tried again a few hours later, not every hour.
      if (company.atsStatus === "pending" && since < RETRY_LOOKUP_HOURS * 3600_000) return { ...out, status: "pending" };
      const d = await discoverBoard(company.slug, company.name, company.atsHints, f, [company.careersUrl]);
      if ((!d.provider || !d.result) && d.inconclusive) {
        // Not "no public board": a lookup failed (429, 422, timeout), so nothing was learned. Shown as pending, never as an error.
        await db.company.update({ where: { id: company.id }, data: { atsStatus: "pending", atsCheckedAt: new Date(), atsError: `Lookup not finished, trying again within ${RETRY_LOOKUP_HOURS} hours: ${d.errors.slice(0, 3).join("; ")}`.slice(0, 500) } });
        return { ...out, status: "pending", error: d.errors[0] };
      }
      if (!d.provider || !d.result) {
        // Employers found through Google Jobs are looked up once; without a public board they stay on Google results.
        await db.company.update({ where: { id: company.id }, data: { ...(company.addedBy === "job-site" ? { atsHints: ["none"] } : {}), atsStatus: "not_found", atsCheckedAt: new Date(), atsError: "No public Greenhouse, Lever, Ashby or SmartRecruiters board found for this company" } });
        return { ...out, status: "not_found" };
      }
      provider = d.provider; token = d.token;
      await db.company.update({ where: { id: company.id }, data: { atsProvider: provider, atsToken: token } });
    }
    // Workday boards are big and share one rate limit, so a scheduled refresh reads each at most every few hours.
    if (opts.scheduled && provider === "WORKDAY" && company.atsStatus === "ok" && company.lastIngestedAt && runStart.getTime() - company.lastIngestedAt.getTime() < WORKDAY_EVERY_HOURS * 3600_000) {
      return { ...out, status: "skipped" };
    }
    // A job site that is limiting the app is not called at all until its pause ends; its boards keep their saved openings.
    const group = PROVIDER_GROUP[provider];
    if (group && isPaused(group)) throw new RateLimited(`${group} is paused`, group);
    // A scheduled refresh reads only a few Workday boards, the ones read longest ago, so its calls are spread over the day.
    if (provider === "WORKDAY" && opts.workdayBudget) {
      if (opts.workdayBudget.left <= 0) return { ...out, status: "skipped" };
      opts.workdayBudget.left--;
    }
    const board = await fetchBoard(provider, token!, f, provider === "WORKDAY" ? { workdayKnown: await knownWorkdayJobs(db, company.id) } : {});
    out.fetched = board.postings.length;
    const now = new Date();
    for (const p of board.postings) {
      const fam = classifyTitle(p.title).family;
      if (!isRelevantFamily(fam)) continue;
      const loc = parseLocation(p.location, { remoteFlag: p.isRemote, workplaceType: p.workplaceType });
      if (!loc.isUS) continue; // non-U.S. roles are never stored or ranked
      out.relevant++;
      const r = await upsertPosting(db, company, p, now);
      if (r === "created") out.created++; else if (r === "updated") out.updated++;
    }
    out.closed = await closeMissing(db, company.id, provider, runStart, now);
    await db.company.update({ where: { id: company.id }, data: { atsStatus: "ok", atsError: null, atsCheckedAt: now, totalOpenings: board.total, lastIngestedAt: now } });
    return out;
  } catch (e) {
    let msg = (e as Error).message?.slice(0, 500) || String(e);
    if (e instanceof RateLimited) {
      // The board exists and its openings stay as last read: nothing is closed after a failed read. It shows as paused,
      // not failed: it is the job site asking the app to slow down, and the app tries again on its own.
      const kept = await db.job.count({ where: { companyId: company.id, status: "OPEN", sources: { some: { provider } } } }).catch(() => 0);
      const since = e.group ? pauseOf(e.group)?.since : undefined;
      msg = `Paused: ${providerName(provider)} is limiting requests from the app${since ? ` (since ${date(new Date(since))})` : ""}. Keeping the ${kept} saved opening${kept === 1 ? "" : "s"}${company.lastIngestedAt ? ` from ${date(company.lastIngestedAt)}` : ""}; the app tries again on its own.`;
      const saved = await db.company.update({ where: { id: company.id }, data: { atsStatus: "paused", atsError: msg, atsCheckedAt: new Date() } }).catch(() => null);
      return saved ? { ...out, status: "paused", error: msg } : { ...out, status: "skipped", error: "Company was merged or removed during the refresh" };
    }
    if (e instanceof BoardNotFound && company.atsProvider !== "NONE" && company.atsToken) {
      // The company's board is gone (Cedar's Ashby board, Nov 20): it moved or was renamed. Look for its current board
      // on the next refresh instead of failing the same way every hour.
      msg = `The ${providerName(company.atsProvider)} board "${company.atsToken}" no longer exists (404). Looking for the company's current job board on the next refresh.`;
      const saved = await db.company.update({ where: { id: company.id }, data: { atsProvider: "NONE", atsToken: null, atsStatus: "pending", atsError: msg, atsCheckedAt: null } }).catch(() => null);
      return saved ? { ...out, status: "pending", error: msg } : { ...out, status: "skipped", error: "Company was merged or removed during the refresh" };
    }
    const saved = await db.company.update({ where: { id: company.id }, data: { atsStatus: "error", atsError: msg, atsCheckedAt: new Date() } }).catch(() => null);
    if (!saved && !(await db.company.findUnique({ where: { id: company.id }, select: { id: true } }))) return { ...out, status: "skipped", error: "Company was merged or removed during the refresh" };
    return { ...out, status: "error", error: msg };
  }
}

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; results[k] = await fn(items[k]); }
  }));
  return results;
}

/** Companies without a public job board are looked up again after this many days. */
export const REPROBE_DAYS = 3;
/** A lookup that a rate limit or outage cut short is tried again after this many hours. */
export const RETRY_LOOKUP_HOURS = 6;
/** A scheduled refresh reads a working Workday board at most this often. */
export const WORKDAY_EVERY_HOURS = 6;
/** A scheduled refresh reads at most this many Workday boards (18 boards over a 15-run day: each about every 5 hours). */
export const WORKDAY_PER_RUN = 4;
/** When the next scheduled refresh starts: ccc-daily at 6 AM and ccc-hourly 7 AM to 9 PM, Arizona time (UTC-7, no daylight saving). */
export function nextScheduledRefresh(now = new Date()) {
  const az = new Date(now.getTime() - 7 * 3600_000);
  const next = new Date(az); next.setUTCMinutes(0, 0, 0); next.setUTCHours(az.getUTCHours() + 1);
  if (next.getUTCHours() > 21 || next.getUTCHours() < 6) { if (next.getUTCHours() > 21) next.setUTCDate(next.getUTCDate() + 1); next.setUTCHours(6); }
  return new Date(next.getTime() + 7 * 3600_000);
}

/** A running refresh reports progress after each board. One silent for this long was cut off (a deploy or restart stopped it). */
export const STALE_RUN_MINUTES = 20;

type Progress = { heartbeat?: string; done?: number; total?: number };
const lastBeat = (r: { startedAt: Date; log: unknown }) => {
  const hb = (r.log as Progress | null)?.heartbeat;
  return hb ? new Date(hb) : r.startedAt;
};

/** The full refresh in progress, if any, with how many boards it has read. Runs that stopped reporting are marked
 *  interrupted so they stop showing as running and stop blocking the next scheduled refresh. Refreshes started from
 *  the web server ("manual") no longer exist, so an old one still marked running died with a restart. */
export async function activeRun(db: PrismaClient, now = new Date()) {
  const cutoff = now.getTime() - STALE_RUN_MINUTES * 60_000;
  const running = await db.ingestionRun.findMany({ where: { status: "running", finishedAt: null, trigger: { not: "manual:company" } }, orderBy: { startedAt: "desc" } });
  const dead = running.filter((r) => r.trigger === "manual" || lastBeat(r).getTime() < cutoff);
  if (dead.length) await db.ingestionRun.updateMany({ where: { id: { in: dead.map((r) => r.id) } }, data: { status: "interrupted" } });
  const live = running.find((r) => !dead.includes(r));
  if (!live) return null;
  const p = (live.log as Progress | null) ?? {};
  return { ...live, done: p.done ?? 0, total: p.total ?? null };
}

export async function runIngestion(db: PrismaClient, opts: { trigger: string; companyIds?: string[]; fetchImpl?: FetchLike } = { trigger: "manual" }) {
  // One full refresh at a time: the hourly job, the morning job and the button used to pile up on each other.
  if (!opts.companyIds) {
    const busy = await activeRun(db);
    if (busy) return { runId: busy.id, status: "skipped" as const, fetched: 0, relevant: 0, created: 0, updated: 0, closed: 0, errors: 0, companies: 0, outcomes: [] as CompanyOutcome[], googleJobs: null };
  }
  const run = await db.ingestionRun.create({ data: { trigger: opts.trigger } });
  // Rate limits that outlast a refresh are saved between refreshes (each hourly refresh is a new process).
  resetRateLimits();
  const pausedBefore = await loadPauses(db).catch(() => ({}));
  const workdayBudget = opts.companyIds ? undefined : { left: WORKDAY_PER_RUN };
  // Boards that were read longest ago go first, so a refresh that gets cut off still moves every board forward over time.
  // Companies with no known board (lookups only) go last.
  const companies = (await db.company.findMany({ where: opts.companyIds ? { id: { in: opts.companyIds } } : {}, orderBy: { lastIngestedAt: { sort: "asc", nulls: "first" } } }))
    .sort((a, b) => Number(a.atsProvider === "NONE") - Number(b.atsProvider === "NONE"));
  const before = new Set((await db.job.findMany({ where: { status: "OPEN" }, select: { id: true } })).map((j) => j.id));
  // Two boards at a time: the refresh runs inside the web server, which has little memory to spare.
  let done = 0;
  const beat = () => db.ingestionRun.update({ where: { id: run.id }, data: { log: { heartbeat: new Date().toISOString(), done, total: companies.length } } }).catch(() => undefined);
  await beat();
  const outcomes = await pool(companies, 2, async (c) => {
    // One company's failure is that company's error, never the whole refresh's.
    const o = await ingestCompany(db, c, opts.fetchImpl ?? fetch, run.startedAt, { scheduled: !opts.companyIds, workdayBudget })
      .catch((e: Error): CompanyOutcome => ({ company: c.name, status: "error", fetched: 0, relevant: 0, created: 0, updated: 0, closed: 0, error: (e?.message || String(e)).slice(0, 500) }));
    done++;
    await beat(); // progress for the banner, and proof of life so a crashed run can be told apart from a slow one
    return o;
  });
  const tot = outcomes.reduce((a, o) => ({ fetched: a.fetched + o.fetched, relevant: a.relevant + o.relevant, created: a.created + o.created, updated: a.updated + o.updated, closed: a.closed + o.closed, errors: a.errors + (o.status === "error" ? 1 : 0) }), { fetched: 0, relevant: 0, created: 0, updated: 0, closed: 0, errors: 0 });
  // Google Jobs adds employers that are not on the list yet; only on a full refresh, at most once a day.
  const googleJobs = opts.companyIds ? null : await runGoogleJobs(db, { fetchImpl: opts.fetchImpl, now: run.startedAt });
  if (googleJobs) { tot.relevant += googleJobs.relevant; tot.created += googleJobs.created; tot.closed += googleJobs.closed; }
  // Fold any copies of one opening into one job before anything counts or alerts on them.
  const merged = await mergeDuplicateJobs(db, run.startedAt).catch(() => null);
  if (merged?.removed) tot.created = Math.max(0, tot.created - merged.removed);
  const status = tot.errors === 0 ? "ok" : tot.errors < companies.length ? "partial" : "failed";
  await db.ingestionRun.update({ where: { id: run.id }, data: { ...tot, companies: companies.length, finishedAt: new Date(), status, log: outcomes } });

  // Alerts for newly discovered high-scoring roles
  const user = await db.user.findFirst({ orderBy: { createdAt: "asc" } });
  const minScore = user?.alertMinScore ?? 80;
  const fresh = await db.job.findMany({ where: { firstSeenAt: { gte: run.startedAt }, status: "OPEN", category: { in: ["MAIN", "STRETCH", "RELOCATION"] }, score: { gte: minScore } }, include: { company: true } });
  for (const j of fresh) if (!before.has(j.id)) await db.alert.create({ data: { kind: "new_high_score_job", title: `New ${j.score}-point match: ${j.title} at ${j.company.name}`, body: j.location ?? undefined, link: `/jobs/${j.id}` } });
  const errored = outcomes.filter((o) => o.status === "error");
  const rl = await savePauses(db, pausedBefore).catch(() => ({ started: [], recovered: [] as string[], paused: pausedBefore as Record<string, { until: number; since: number; strikes: number }> }));
  await alertOnce(db, outcomes, errored);
  // One notice when a job site starts limiting the app, and one when it lets the app back in; nothing in between.
  for (const { group, pause } of rl.started) {
    const n = companies.filter((c) => PROVIDER_GROUP[c.atsProvider] === group).length;
    await db.alert.create({ data: { kind: "integration_error", title: `${groupName(group)} is limiting the app, so ${n} ${groupName(group)} job board${n === 1 ? " is" : "s are"} paused`, body: `Their saved openings stay in Discover Jobs. The app tries again after ${dateTime(new Date(pause.until))} and waits longer each time it is still limited (up to a day). Nothing for you to do.`, link: "/settings" } });
  }
  for (const group of rl.recovered) await db.alert.create({ data: { kind: "integration_error", title: `${groupName(group)} job boards are refreshing again`, body: `${groupName(group)} is answering the app again; its boards are read a few at a time over the next hours.`, link: "/settings" } });
  for (const p of ["GREENHOUSE", "LEVER", "ASHBY", "SMARTRECRUITERS", "WORKDAY", "WORKABLE", "AMAZON", "ORACLE", "RIPPLING"]) {
    const cs = companies.filter((c) => c.atsProvider === p).map((c) => c.name);
    const errs = errored.filter((o) => cs.includes(o.company)).length;
    const group = PROVIDER_GROUP[p];
    const pause = group ? rl.paused[group] : undefined;
    const paused = pause ? outcomes.filter((o) => o.status === "paused" && cs.includes(o.company)).length || cs.length : 0;
    const status = !cs.length ? "not_configured" : pause ? "paused" : errs === 0 ? "connected" : errs === cs.length ? "error" : "degraded";
    const detail = pause
      ? `${cs.length} companies, ${paused} paused: ${providerName(p)} has been limiting the app's requests since ${date(new Date(pause.since))}. Saved openings are kept; next try after ${dateTime(new Date(pause.until))}.${errs ? ` ${errs} other errors.` : ""}`
      : `${cs.length} companies, ${errs} errors in last run`;
    await db.integrationStatus.upsert({
      where: { id: p.toLowerCase() },
      create: { id: p.toLowerCase(), name: providerName(p), status, detail },
      update: { status, detail, checkedAt: new Date() },
    });
  }
  // Failures before a board is known (network, probing) belong to discovery, not to a provider.
  const undiscovered = companies.filter((c) => !c.atsProvider || c.atsProvider === "NONE").map((c) => c.name);
  const dErrs = errored.filter((o) => undiscovered.includes(o.company));
  const dStatus = !undiscovered.length || dErrs.length === 0 ? "connected" : dErrs.length === undiscovered.length ? "error" : "degraded";
  const dDetail = `${undiscovered.length} companies without a known board, ${dErrs.length} lookup errors${dErrs[0]?.error ? ` (e.g. ${dErrs[0].company}: ${String(dErrs[0].error).slice(0, 160)})` : ""}`;
  await db.integrationStatus.upsert({
    where: { id: "discovery" },
    create: { id: "discovery", name: "Board discovery", status: dStatus, detail: dDetail },
    update: { status: dStatus, detail: dDetail, checkedAt: new Date() },
  });
  if (googleJobs?.status === "error") await db.alert.create({ data: { kind: "integration_error", title: "Google Jobs search failed", body: googleJobs.error, link: "/settings" } });
  return { runId: run.id, status, ...tot, companies: companies.length, outcomes, googleJobs };
}

const ALERTED = "feed_alerts";
/** Posts "job feeds stopped refreshing" only for feeds that were not already failing when the last alert went out, so an
 *  ongoing problem is one alert, not one every hour (Nov 19 to 21: the same 19 feeds, every hour). A feed that recovers
 *  leaves the list and gets a new alert if it fails again later. */
async function alertOnce(db: PrismaClient, outcomes: CompanyOutcome[], errored: CompanyOutcome[]) {
  const row = await db.integrationStatus.findUnique({ where: { id: ALERTED } });
  let before: string[] = [];
  try { before = JSON.parse(row?.detail ?? "[]"); } catch { before = []; }
  // A company this refresh did not read (skipped, waiting for its turn) keeps its place on the list.
  const read = new Set(outcomes.filter((o) => o.status !== "skipped").map((o) => o.company));
  const failing = [...new Set([...before.filter((c) => !read.has(c)), ...errored.map((o) => o.company)])].sort();
  const fresh = errored.filter((o) => !before.includes(o.company));
  if (fresh.length) await db.alert.create({ data: { kind: "integration_error", title: `${fresh.length} job feed${fresh.length > 1 ? "s" : ""} stopped refreshing`, body: fresh.slice(0, 8).map((o) => `${o.company}: ${o.error}`).join("\n"), link: "/settings" } });
  const detail = JSON.stringify(failing);
  await db.integrationStatus.upsert({ where: { id: ALERTED }, create: { id: ALERTED, name: "Feed failure alerts", status: "connected", detail }, update: { detail, checkedAt: new Date() } });
}

/** Recompute scores after company assessments or the profile change. */
export async function rescoreAll(db: PrismaClient) {
  // In pages, so every job and its description is never in memory at once.
  let count = 0;
  for (let cursor: string | undefined; ; ) {
    const jobs = await db.job.findMany({ include: { company: true }, orderBy: { id: "asc" }, take: 200, ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}) });
    if (!jobs.length) break;
    await rescorePage(db, jobs);
    count += jobs.length;
    cursor = jobs[jobs.length - 1].id;
  }
  return count;
}

async function rescorePage(db: PrismaClient, jobs: (Job & { company: Company })[]) {
  for (const j of jobs) {
    const s = scoreJob({ ...j, company: j.company });
    // Role type and seniority are stored for the Role type filter, so they follow title-rule changes too.
    if (s.family !== j.roleFamily || s.seniority !== j.seniority) await db.job.update({ where: { id: j.id }, data: { roleFamily: s.family, seniority: s.seniority } });
    if (s.score !== j.score || s.tier !== j.tier || s.category !== j.category || (s.excludedReason ?? null) !== j.excludedReason) {
      await db.job.update({ where: { id: j.id }, data: { score: s.score, scoreBreakdown: s.breakdown, scoreReasons: s.reasons, confidence: s.confidence, tier: s.tier, category: s.category, excludedReason: s.excludedReason ?? null } });
      await db.jobEvent.create({ data: { jobId: j.id, kind: "rescored", detail: `${j.score ?? "–"} → ${s.score}` } });
    }
  }
}
