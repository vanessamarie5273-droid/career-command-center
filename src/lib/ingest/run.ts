import type { Company, PrismaClient } from "@prisma/client";
import { classifyTitle, isRelevantFamily } from "../roles";
import { htmlToText, parseCompensation, parseLocation, parseYearsRequired, requiresClearance, splitQualifications, extractTravel, extractRelocation, extractTerritory } from "../normalize";
import { jobFingerprint, contentHash } from "../dedupe";
import { scoreJob } from "../scoring";
import { fetchBoard, discoverBoard } from "./providers";
import type { FetchLike, RawPosting } from "./types";

export type CompanyOutcome = { company: string; status: "ok" | "error" | "not_found" | "unsupported"; fetched: number; relevant: number; created: number; updated: number; closed: number; error?: string };

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

export function applyScore(data: ReturnType<typeof buildJobData>, company: Company) {
  const s = scoreJob({ ...data, company });
  return { score: s.score, scoreBreakdown: s.breakdown, scoreReasons: s.reasons, confidence: s.confidence, tier: s.tier, category: s.category, excludedReason: s.excludedReason ?? null };
}

/** Persist one posting with cross-source deduplication. Returns what happened. */
export async function upsertPosting(db: PrismaClient, company: Company, p: RawPosting, now: Date): Promise<"created" | "updated" | "verified"> {
  const data = buildJobData(company, p);
  const scored = applyScore(data, company);
  const existingSource = await db.jobSource.findUnique({ where: { provider_externalId: { provider: p.provider, externalId: p.externalId } }, include: { job: true } });
  const job = existingSource?.job ?? (await db.job.findUnique({ where: { fingerprint: data.fingerprint } }));
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
  await db.jobEvent.create({ data: { jobId: job.id, kind: reopened ? "reopened" : changed ? "updated" : "verified", detail: existingSource ? undefined : `Merged duplicate from ${p.provider}`, at: now } });
  return changed || reopened ? "updated" : "verified";
}

/** Close jobs from this company/provider not seen in a successful fetch. Never called after a failed fetch. */
export async function closeMissing(db: PrismaClient, companyId: string, provider: string, runStart: Date, now: Date) {
  const stale = await db.job.findMany({
    where: { companyId, status: "OPEN", manual: false, sources: { some: { provider } } },
    include: { sources: true },
  });
  let closed = 0;
  for (const j of stale) {
    const seenThisRun = j.sources.some((s) => s.lastSeenAt >= runStart);
    if (seenThisRun) continue;
    await db.job.update({ where: { id: j.id }, data: { status: "CLOSED", closedAt: now } });
    await db.jobEvent.create({ data: { jobId: j.id, kind: "closed", detail: `No longer listed on ${provider} board`, at: now } });
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
      const d = await discoverBoard(company.slug, company.name, company.atsHints, f);
      if (!d.provider || !d.result) {
        await db.company.update({ where: { id: company.id }, data: { atsStatus: "not_found", atsCheckedAt: new Date(), atsError: d.errors.length ? d.errors.slice(0, 3).join("; ") : "No public Greenhouse, Lever or Ashby board found for this company" } });
        return { ...out, status: d.errors.length ? "error" : "not_found", error: d.errors[0] };
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
    const msg = (e as Error).message?.slice(0, 500) || String(e);
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

export async function runIngestion(db: PrismaClient, opts: { trigger: string; companyIds?: string[]; fetchImpl?: FetchLike } = { trigger: "manual" }) {
  const run = await db.ingestionRun.create({ data: { trigger: opts.trigger } });
  const companies = await db.company.findMany({ where: opts.companyIds ? { id: { in: opts.companyIds } } : {} });
  const before = new Set((await db.job.findMany({ where: { status: "OPEN" }, select: { id: true } })).map((j) => j.id));
  const outcomes = await pool(companies, 6, (c) => ingestCompany(db, c, opts.fetchImpl ?? fetch, run.startedAt));
  const tot = outcomes.reduce((a, o) => ({ fetched: a.fetched + o.fetched, relevant: a.relevant + o.relevant, created: a.created + o.created, updated: a.updated + o.updated, closed: a.closed + o.closed, errors: a.errors + (o.status === "error" ? 1 : 0) }), { fetched: 0, relevant: 0, created: 0, updated: 0, closed: 0, errors: 0 });
  const status = tot.errors === 0 ? "ok" : tot.errors < companies.length ? "partial" : "failed";
  await db.ingestionRun.update({ where: { id: run.id }, data: { ...tot, companies: companies.length, finishedAt: new Date(), status, log: outcomes } });

  // Alerts for newly discovered high-scoring roles
  const user = await db.user.findFirst({ orderBy: { createdAt: "asc" } });
  const minScore = user?.alertMinScore ?? 80;
  const fresh = await db.job.findMany({ where: { firstSeenAt: { gte: run.startedAt }, status: "OPEN", category: { in: ["MAIN", "STRETCH"] }, score: { gte: minScore } }, include: { company: true } });
  for (const j of fresh) if (!before.has(j.id)) await db.alert.create({ data: { kind: "new_high_score_job", title: `New ${j.score}-point match: ${j.title} at ${j.company.name}`, body: j.location ?? undefined, link: `/jobs/${j.id}` } });
  const errored = outcomes.filter((o) => o.status === "error");
  if (errored.length) await db.alert.create({ data: { kind: "integration_error", title: `${errored.length} job feed${errored.length > 1 ? "s" : ""} failed to refresh`, body: errored.slice(0, 8).map((o) => `${o.company}: ${o.error}`).join("\n"), link: "/settings" } });
  for (const p of ["GREENHOUSE", "LEVER", "ASHBY", "SMARTRECRUITERS", "WORKDAY"]) {
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
  return { runId: run.id, status, ...tot, companies: companies.length, outcomes };
}

/** Recompute scores after company assessments or the profile change. */
export async function rescoreAll(db: PrismaClient) {
  const jobs = await db.job.findMany({ include: { company: true } });
  for (const j of jobs) {
    const s = scoreJob({ ...j, company: j.company });
    if (s.score !== j.score || s.tier !== j.tier || s.category !== j.category || (s.excludedReason ?? null) !== j.excludedReason) {
      await db.job.update({ where: { id: j.id }, data: { score: s.score, scoreBreakdown: s.breakdown, scoreReasons: s.reasons, confidence: s.confidence, tier: s.tier, category: s.category, excludedReason: s.excludedReason ?? null } });
      await db.jobEvent.create({ data: { jobId: j.id, kind: "rescored", detail: `${j.score ?? "–"} → ${s.score}` } });
    }
  }
  return jobs.length;
}
