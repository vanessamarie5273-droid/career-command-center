// Google Jobs search, read through SerpApi (Google has no public jobs API). It finds sales roles at employers
// that are not on the company list yet. Each result is matched to a company (or a new one is added), staffing
// agencies are skipped, and the employer's own apply link is preferred over job-site links.
// After a successful search it waits 20 hours, so the daily search budget holds even though the refresh also runs hourly.
import type { Company, PrismaClient } from "@prisma/client";
import { getJson } from "./http";
import type { FetchLike, RawPosting } from "./types";
import { classifyTitle, isRelevantFamily } from "../roles";
import { offLimitsReason } from "../offLimits";
import { parseLocation } from "../normalize";
import { upsertPosting } from "./run";

export const GOOGLE_JOBS = "GOOGLE_JOBS";
export const JOB_SITE_CATEGORY = "Found on Google Jobs";
const STATUS_ID = "google_jobs";
const MIN_HOURS_BETWEEN = 20;
/** Google-only roles that stop showing up in searches are closed after this many days. */
const STALE_DAYS = 14;

const PHX = "Phoenix, Arizona, United States";
/** One Google search each per day: about 180 a month. */
export const SEARCHES: { q: string; location: string }[] = [
  { q: "enterprise account executive", location: PHX },
  { q: "strategic account executive", location: PHX },
  { q: "business development director", location: PHX },
  { q: "sales development manager", location: PHX },
  { q: "regional sales director software", location: PHX },
  { q: "enterprise account executive remote", location: "United States" },
];

type GJ = {
  error?: string;
  jobs_results?: {
    job_id?: string; title: string; company_name?: string; location?: string; via?: string; share_link?: string; thumbnail?: string; description?: string;
    detected_extensions?: { posted_at?: string; work_from_home?: boolean; schedule_type?: string };
    apply_options?: { title?: string; link: string }[];
  }[];
};

const JOB_SITES = /linkedin|indeed|ziprecruiter|glassdoor|monster|simplyhired|dice|builtin|built in|talent\.com|jooble|lensa|adzuna|careerbuilder|snagajob|wellfound|jobright|teal|ladders|salary\.com|bebee|jobilize|learn4good|recruit\.net|google/i;
const STAFFING = /\b(staffing|recruit(ing|ment|ers)?|robert half|insight global|teksystems|randstad|kforce|jobot|aerotek|adecco|manpower|kelly services|apex systems|motion recruitment|cybercoders|hays|search (group|partners)|executive search|headhunt|confidential|anonymous|stealth)\b/i;

/** The employer's own posting when Google lists it, otherwise the first apply link. */
export function bestApplyLink(options: { title?: string; link: string }[] = [], fallback?: string) {
  const own = options.find((o) => !JOB_SITES.test(`${o.title ?? ""} ${o.link}`));
  return own?.link ?? options[0]?.link ?? fallback ?? null;
}

/** "3 days ago", "21 hours ago", "1 month ago", "30+ days ago" → a date. */
export function postedDate(text: string | undefined, now = new Date()) {
  const m = text?.match(/(\d+)\+?\s*(minute|hour|day|week|month)s?\s+ago/i);
  if (!m) return null;
  const unit = { minute: 60e3, hour: 3600e3, day: 86400e3, week: 7 * 86400e3, month: 30 * 86400e3 }[m[2].toLowerCase() as "day"];
  return new Date(now.getTime() - Number(m[1]) * unit);
}

export const normalizeCompanyName = (n: string) =>
  n.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9 ]+/g, " ").replace(/\b(inc|llc|ltd|corp|corporation|co|company|the|plc|holdings|group|technologies|technology)\b/g, " ").replace(/\s+/g, " ").trim();

const slugify = (n: string) => n.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function googleJobsConfigured() {
  return !!process.env.SERPAPI_API_KEY;
}

export type JobSiteOutcome = { status: "ok" | "skipped" | "not_configured" | "error"; searches: number; found: number; relevant: number; created: number; companiesAdded: number; skippedStaffing: number; closed: number; error?: string };

export async function runGoogleJobs(db: PrismaClient, opts: { fetchImpl?: FetchLike; now?: Date; force?: boolean; apiKey?: string } = {}): Promise<JobSiteOutcome> {
  const out: JobSiteOutcome = { status: "ok", searches: 0, found: 0, relevant: 0, created: 0, companiesAdded: 0, skippedStaffing: 0, closed: 0 };
  const key = opts.apiKey ?? process.env.SERPAPI_API_KEY;
  const now = opts.now ?? new Date();
  const prev = await db.integrationStatus.findUnique({ where: { id: STATUS_ID } });
  if (!key) {
    // A service without the key must not overwrite the status written by one that has it.
    if (!prev) await db.integrationStatus.create({ data: { id: STATUS_ID, name: "Google Jobs", status: "not_configured", detail: "Set SERPAPI_API_KEY to search Google Jobs" } });
    return { ...out, status: "not_configured" };
  }
  if (!opts.force && prev?.status === "connected" && prev.checkedAt && now.getTime() - prev.checkedAt.getTime() < MIN_HOURS_BETWEEN * 3600e3) return { ...out, status: "skipped" };
  const f = opts.fetchImpl ?? fetch;

  try {
    const companies = await db.company.findMany();
    const byName = new Map(companies.map((c) => [normalizeCompanyName(c.name), c]));
    const seen = new Set<string>();
    for (const s of SEARCHES) {
      const url = `https://serpapi.com/search.json?engine=google_jobs&q=${encodeURIComponent(s.q)}&location=${encodeURIComponent(s.location)}&hl=en&gl=us&api_key=${encodeURIComponent(key)}`;
      const r = await getJson<GJ>(f, url);
      out.searches++;
      if (r.error && !/hasn't returned any results/i.test(r.error)) throw new Error(`SerpApi: ${r.error}`);
      for (const j of r.jobs_results ?? []) {
        out.found++;
        const id = j.job_id || `${j.company_name}|${j.title}|${j.location}`;
        if (seen.has(id) || !j.company_name) continue;
        seen.add(id);
        if (STAFFING.test(j.company_name)) { out.skippedStaffing++; continue; }
        if (offLimitsReason({ name: j.company_name })) continue;
        if (!isRelevantFamily(classifyTitle(j.title).family)) continue;
        const remote = !!j.detected_extensions?.work_from_home || /remote|anywhere/i.test(j.location ?? "");
        const location = remote && !/remote/i.test(j.location ?? "") ? `Remote, ${j.location || "United States"}` : j.location || null;
        if (!parseLocation(location, { remoteFlag: remote }).isUS) continue;
        const applyUrl = bestApplyLink(j.apply_options, j.share_link);
        if (!applyUrl) continue;
        out.relevant++;

        let company: Company | undefined = byName.get(normalizeCompanyName(j.company_name));
        if (!company) {
          const base = slugify(j.company_name) || "company";
          const slug = companies.some((c) => c.slug === base) ? `${base}-${Math.random().toString(36).slice(2, 6)}` : base;
          company = await db.company.create({ data: { slug, name: j.company_name.trim(), category: JOB_SITE_CATEGORY, logoUrl: j.thumbnail ?? null, linkedinUrl: `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(j.company_name)}`, addedBy: "job-site", profileSource: "Found on Google Jobs; not yet researched" } });
          companies.push(company);
          byName.set(normalizeCompanyName(company.name), company);
          out.companiesAdded++;
        }
        const posting: RawPosting = {
          provider: GOOGLE_JOBS, externalId: id.slice(0, 500), title: j.title.trim(), location, isRemote: remote,
          descriptionText: j.description ?? null, applyUrl, postedAt: postedDate(j.detected_extensions?.posted_at, now),
        };
        if ((await upsertPosting(db, company, posting, now)) === "created") out.created++;
      }
    }
    // Searches show a sample, so a role missing once is not gone; close Google-only roles unseen for two weeks.
    const stale = await db.job.findMany({ where: { status: "OPEN", manual: false, sources: { every: { provider: GOOGLE_JOBS, lastSeenAt: { lt: new Date(now.getTime() - STALE_DAYS * 86400e3) } }, some: {} } }, select: { id: true } });
    for (const j of stale) {
      await db.job.update({ where: { id: j.id }, data: { status: "CLOSED", closedAt: now } });
      await db.jobEvent.create({ data: { jobId: j.id, kind: "closed", detail: `Not seen in Google Jobs for ${STALE_DAYS} days`, at: now } });
    }
    out.closed = stale.length;
    const detail = `${out.searches} searches, ${out.relevant} sales roles, ${out.created} new, ${out.companiesAdded} companies added, ${out.skippedStaffing} staffing-agency posts skipped`;
    await db.integrationStatus.upsert({ where: { id: STATUS_ID }, create: { id: STATUS_ID, name: "Google Jobs", status: "connected", detail, checkedAt: now }, update: { status: "connected", detail, checkedAt: now } });
    return out;
  } catch (e) {
    const msg = ((e as Error).message || String(e)).replace(key, "***").slice(0, 400);
    await db.integrationStatus.upsert({ where: { id: STATUS_ID }, create: { id: STATUS_ID, name: "Google Jobs", status: "error", detail: msg, checkedAt: now }, update: { status: "error", detail: msg, checkedAt: now } });
    return { ...out, status: "error", error: msg };
  }
}
