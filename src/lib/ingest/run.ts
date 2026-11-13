import type { Company, Job, PrismaClient } from "@prisma/client";
import { classifyTitle, isRelevantFamily } from "../roles";
import { htmlToText, parseCompensation, parseLocation, parseYearsRequired, requiresClearance, splitQualifications, extractTravel, extractRelocation, extractTerritory } from "../normalize";
import { jobFingerprint, contentHash } from "../dedupe";
import { scoreJob } from "../scoring";
import { fetchBoard, discoverBoard } from "./providers";
import { RateLimited, type FetchLike, type RawPosting } from "./types";
import { range } from "../format";
import { runGoogleJobs } from "./googleJobs";

export type CompanyOutcome = { company: string; status: "ok" | "error" | "not_found" | "unsupported" | "pending"; fetched: number; relevant: number; created: number; updated: number; closed: number; error?: string };

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
  const job = existingSource?.job ?? (await db.job.findUnique({ where: { fingerprint: data.fingerprint } }));
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

export async function ingestCompany(db: PrismaClient, company: Company, f: FetchLike = fetch, runStart = new Date()): Promise<CompanyOutcome> {
  const out: CompanyOutcome = { company: company.name, status: "ok", fetched: 0, relevant: 0, created: 0, updated: 0, closed: 0 };
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
    const board = await fetchBoard(provider, token!, f);
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
      // The board exists and its openings stay as last read: nothing is closed after a failed read.
      const kept = await db.job.count({ where: { companyId: company.id, status: "OPEN", sources: { some: { provider } } } });
      msg = `${provider[0]}${provider.slice(1).toLowerCase()} is limiting requests from the app's server (HTTP 429). Keeping the ${kept} saved opening${kept === 1 ? "" : "s"}${company.lastIngestedAt ? ` from ${company.lastIngestedAt.toISOString().slice(0, 10)}` : ""}; trying again next refresh.`;
    }
    await db.company.update({ where: { id: company.id }, data: { atsStatus: "error", atsError: msg, atsCheckedAt: new Date() } });
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
    const o = await ingestCompany(db, c, opts.fetchImpl ?? fetch, run.startedAt);
    done++;
    await beat(); // progress for the banner, and proof of life so a crashed run can be told apart from a slow one
    return o;
  });
  const tot = outcomes.reduce((a, o) => ({ fetched: a.fetched + o.fetched, relevant: a.relevant + o.relevant, created: a.created + o.created, updated: a.updated + o.updated, closed: a.closed + o.closed, errors: a.errors + (o.status === "error" ? 1 : 0) }), { fetched: 0, relevant: 0, created: 0, updated: 0, closed: 0, errors: 0 });
  // Google Jobs adds employers that are not on the list yet; only on a full refresh, at most once a day.
  const googleJobs = opts.companyIds ? null : await runGoogleJobs(db, { fetchImpl: opts.fetchImpl, now: run.startedAt });
  if (googleJobs) { tot.relevant += googleJobs.relevant; tot.created += googleJobs.created; tot.closed += googleJobs.closed; }
  const status = tot.errors === 0 ? "ok" : tot.errors < companies.length ? "partial" : "failed";
  await db.ingestionRun.update({ where: { id: run.id }, data: { ...tot, companies: companies.length, finishedAt: new Date(), status, log: outcomes } });

  // Alerts for newly discovered high-scoring roles
  const user = await db.user.findFirst({ orderBy: { createdAt: "asc" } });
  const minScore = user?.alertMinScore ?? 80;
  const fresh = await db.job.findMany({ where: { firstSeenAt: { gte: run.startedAt }, status: "OPEN", category: { in: ["MAIN", "STRETCH", "RELOCATION"] }, score: { gte: minScore } }, include: { company: true } });
  for (const j of fresh) if (!before.has(j.id)) await db.alert.create({ data: { kind: "new_high_score_job", title: `New ${j.score}-point match: ${j.title} at ${j.company.name}`, body: j.location ?? undefined, link: `/jobs/${j.id}` } });
  const errored = outcomes.filter((o) => o.status === "error");
  if (errored.length) await db.alert.create({ data: { kind: "integration_error", title: `${errored.length} job feed${errored.length > 1 ? "s" : ""} failed to refresh`, body: errored.slice(0, 8).map((o) => `${o.company}: ${o.error}`).join("\n"), link: "/settings" } });
  for (const p of ["GREENHOUSE", "LEVER", "ASHBY", "SMARTRECRUITERS", "WORKDAY", "WORKABLE", "AMAZON", "ORACLE"]) {
    const cs = companies.filter((c) => c.atsProvider === p).map((c) => c.name);
    const errs = errored.filter((o) => cs.includes(o.company)).length;
    await db.integrationStatus.upsert({
      where: { id: p.toLowerCase() },
      create: { id: p.toLowerCase(), name: p[0] + p.slice(1).toLowerCase(), status: !cs.length ? "not_configured" : errs === 0 ? "connected" : errs === cs.length ? "error" : "degraded", detail: `${cs.length} companies, ${errs} errors in last run` },
      update: { status: !cs.length ? "not_configured" : errs === 0 ? "connected" : errs === cs.length ? "error" : "degraded", detail: `${cs.length} companies, ${errs} errors in last run`, checkedAt: new Date() },
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
