// Company research: Claude reads public sources with web search and fills the account profile the app
// already shows (overview, scores, growth outlook, financials, leaders, recent developments), then the
// company's job board is refreshed so its openings are current.
//
// It runs in the web process, so it is kept light: one research at a time (a small queue), no job
// descriptions, and only the structured result is kept. A finished research never overwrites a field
// she edited herself (see herFields), and figures, leaders and news are kept only with a source link
// that the search actually returned.
import Anthropic from "@anthropic-ai/sdk";
import type { Company, Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { MODEL } from "./assistant";
import { boardHintFromUrl } from "./companies";
import { ingestCompany } from "./ingest/run";
import { scoreJob } from "./scoring";
import { PROFILE } from "./profile";

export const RESEARCH_STALE_MS = 15 * 60_000; // a "running" research older than this died with a restart
const MAX_TURNS = 6;

// ---------------------------------------------------------------------------------------------
// What the model returns (the save_research tool). Strict tool use guarantees the shape; zod
// re-checks it and clamps scores.

const str = { type: ["string", "null"] } as const;
const int = { type: ["integer", "null"] } as const;
const NEWS_KINDS = ["funding", "leadership", "product", "acquisition", "partnership", "hiring", "earnings", "layoffs"] as const;
export const MATURITY = ["Emerging", "High-growth private", "Late-stage private", "Pre-IPO", "Recently public", "Established public", "Established private", "Subsidiary"] as const;

const SAVE_TOOL: Anthropic.Beta.BetaTool = {
  name: "save_research",
  description: "Save the finished company research. Call it exactly once, after your searches. Use null for anything the sources did not establish.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["website", "linkedinUrl", "jobBoardUrl", "headquarters", "ownership", "ticker", "maturity", "description", "keyProducts", "customers", "buyerPersonas", "footprint",
      "growthScore", "growthThesis", "marketPositionScore", "equityUpsideScore", "compCompetitiveness", "assessmentRationale", "risks", "cultureNotes", "financials", "leaders", "news", "sources"],
    properties: {
      website: { ...str, description: "Company homepage, https://" },
      linkedinUrl: { ...str, description: "The company's LinkedIn page (linkedin.com/company/...), only if seen in a source" },
      jobBoardUrl: { ...str, description: "Link to the company's job board or one of its postings (Greenhouse, Lever, Ashby, SmartRecruiters, Workday, or its careers page)" },
      headquarters: { ...str, description: "City, State (or City, Country)" },
      ownership: { type: ["string", "null"], enum: ["Public", "Private", "Subsidiary", null] },
      ticker: { ...str, description: "Exchange ticker if public" },
      maturity: { type: ["string", "null"], enum: [...MATURITY, null] },
      description: { ...str, description: "Business & positioning: what they sell, to whom, how they win, and where the business is heading. 3-5 short sentences." },
      keyProducts: { ...str, description: "Main products or platforms, comma separated" },
      customers: { ...str, description: "Customers the company names publicly, comma separated; null if none found" },
      buyerPersonas: { ...str, description: "Who buys: titles and departments their sellers sell to" },
      footprint: { ...str, description: "Where they operate and sell; note any Phoenix / Arizona presence" },
      growthScore: { ...int, description: "0-100: how likely the company is to grow very fast in the next 2-3 years (revenue, headcount, value)" },
      growthThesis: { ...str, description: "One line on why, under 110 characters" },
      marketPositionScore: { ...int, description: "0-100: strength of its market position" },
      equityUpsideScore: { ...int, description: "0-100: upside of equity for a new hire" },
      compCompetitiveness: { ...int, description: "0-100: how competitive its sales compensation likely is" },
      assessmentRationale: { ...str, description: "Why this company is (or isn't) attractive for a senior enterprise seller, 2-3 sentences" },
      risks: { ...str, description: "Risks: equity, stability, layoffs, competition, leadership churn" },
      cultureNotes: { ...str, description: "Culture & employment considerations from public sources (reviews, leadership statements, return-to-office policy)" },
      financials: {
        type: "object", additionalProperties: false,
        required: ["revenue", "revenueGrowth", "fundingSummary", "valuation", "investors", "liquidityNotes", "sourceUrl"],
        description: "Only figures stated in a source you found. sourceUrl is that source.",
        properties: { revenue: str, revenueGrowth: { ...str, description: "e.g. '32% year over year (FY2026)'" }, fundingSummary: str, valuation: str, investors: str, liquidityNotes: str, sourceUrl: str },
      },
      leaders: {
        type: "array", description: "Sales and revenue leaders and sales recruiters, up to 6, each from a source",
        items: { type: "object", additionalProperties: false, required: ["name", "title", "linkedinUrl", "sourceUrl"], properties: { name: { type: "string" }, title: { type: "string" }, linkedinUrl: str, sourceUrl: { type: "string" } } },
      },
      news: {
        type: "array", description: "Up to 6 developments from the last 12 months that matter to a sales hire",
        items: { type: "object", additionalProperties: false, required: ["headline", "kind", "url", "publishedAt"], properties: { headline: { type: "string" }, kind: { type: "string", enum: [...NEWS_KINDS] }, url: { type: "string" }, publishedAt: { ...str, description: "YYYY-MM-DD" } } },
      },
      sources: {
        type: "array", description: "The pages you relied on, up to 12",
        items: { type: "object", additionalProperties: false, required: ["title", "url"], properties: { title: { type: "string" }, url: { type: "string" } } },
      },
    },
  },
};

const s = z.string().trim().max(5000).nullable().transform((v) => (v ? v : null));
const score = z.number().nullable().transform((v) => (v == null || isNaN(v) ? null : Math.max(0, Math.min(100, Math.round(v)))));
export const ResearchResult = z.object({
  website: s, linkedinUrl: s, jobBoardUrl: s, headquarters: s, ownership: s, ticker: s, maturity: s,
  description: s, keyProducts: s, customers: s, buyerPersonas: s, footprint: s,
  growthScore: score, growthThesis: s, marketPositionScore: score, equityUpsideScore: score, compCompetitiveness: score,
  assessmentRationale: s, risks: s, cultureNotes: s,
  financials: z.object({ revenue: s, revenueGrowth: s, fundingSummary: s, valuation: s, investors: s, liquidityNotes: s, sourceUrl: s }),
  leaders: z.array(z.object({ name: z.string().trim().min(1).max(200), title: z.string().trim().min(1).max(200), linkedinUrl: s, sourceUrl: z.string() })).max(12),
  news: z.array(z.object({ headline: z.string().trim().min(1).max(500), kind: z.string(), url: z.string(), publishedAt: s })).max(12),
  sources: z.array(z.object({ title: z.string().max(300), url: z.string() })).max(20),
});
export type ResearchResult = z.infer<typeof ResearchResult>;

// ---------------------------------------------------------------------------------------------
// The call

const SYSTEM = `You research companies for Vanessa, a senior enterprise sales executive running her job search like a strategic deal: each company is an account. She lives in the Phoenix area and targets enterprise Account Executive, Business Development and Sales Development leadership roles, Phoenix-area or remote.

Use web search to build a current, factual account profile, then call save_research once.
- Search the company's own site, recent press releases, earnings or funding announcements, reputable business press, and its job board. Prefer sources from the last 12 months.
- Facts (customers, figures, leaders, news) must come from a page you found. Never guess a number, a customer or a person. Use null when the sources don't say.
- Every financial figure, leader and news item needs the URL of the page that states it.
- Scores are your assessment, 0-100, calibrated: 50 is an ordinary company, 70+ is strong, 85+ is exceptional (Palantir after AIP, Databricks, Ramp).
- Write in short, direct sentences. No filler, no marketing adjectives.`;

type Create = (p: Anthropic.Beta.MessageCreateParamsNonStreaming) => Promise<Anthropic.Beta.BetaMessage>;
export type ResearchDeps = { create?: Create; fetch?: typeof fetch };

function knownProfile(c: Company) {
  const rows: [string, unknown][] = [["Name", c.name], ["Website", c.website], ["Industry", c.category], ["Headquarters", c.headquarters], ["Ownership", c.ownership], ["Description on file", c.description], ["Products on file", c.keyProducts], ["Careers page", c.careersUrl]];
  return rows.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("\n");
}

/** Every URL the search (or a fetch) returned in this conversation, so cited links can be checked. */
export function seenUrls(content: unknown[]): Set<string> {
  const out = new Set<string>();
  const walk = (v: unknown, depth: number) => {
    if (depth > 8 || v == null || typeof v !== "object") return;
    if (Array.isArray(v)) { for (const x of v) walk(x, depth + 1); return; }
    const o = v as Record<string, unknown>;
    if (o.type === "tool_use" && o.name === SAVE_TOOL.name) return; // the model's own answer doesn't count as a source
    if (typeof o.url === "string") out.add(normUrl(o.url));
    for (const [k, x] of Object.entries(o)) if (k !== "encrypted_content" && k !== "encrypted_index") walk(x, depth + 1);
  };
  walk(content, 0);
  return out;
}

export const normUrl = (u: string) => u.trim().replace(/#.*$/, "").replace(/\/+$/, "").replace(/^http:\/\//, "https://").replace(/^https:\/\/www\./, "https://").toLowerCase();
const isHttp = (u: string | null | undefined): u is string => !!u && /^https?:\/\/[^\s]+$/i.test(u);

/** Runs the research conversation: web search, then save_research. Resumes paused turns. */
export async function runResearch(c: Company, deps: ResearchDeps = {}): Promise<{ result: ResearchResult; seen: Set<string> }> {
  const create: Create = deps.create ?? ((p) => new Anthropic().beta.messages.create(p));
  const ask = `Research ${c.name} as a target account.\n\n${knownProfile(c)}\n\nHer focus: ${PROFILE.targetRoles.slice(0, 6).join(", ")}. Find their sales leaders (CRO, VP Sales, RVPs, sales development leaders, Head of Public Sector, sales recruiters) and anything that shows where their go-to-market is under pressure or growing: a new market, a missed number, a reorganisation, new funding, a big launch.`;
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: ask }];
  const all: unknown[] = [];
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const res = await create({
      model: MODEL, max_tokens: 16000, output_config: { effort: "medium" },
      system: SYSTEM, messages,
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 10 }, SAVE_TOOL],
      tool_choice: { type: "auto" },
      betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
    });
    all.push(...res.content);
    if (res.stop_reason === "refusal") throw new Error("The model declined to research this company.");
    const save = res.content.find((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use" && b.name === SAVE_TOOL.name);
    if (save) return { result: ResearchResult.parse(save.input), seen: seenUrls(all) };
    messages.push({ role: "assistant", content: res.content });
    // A paused server-side search resumes on its own when the turn is sent back; otherwise ask for the save.
    if (res.stop_reason !== "pause_turn") messages.push({ role: "user", content: "Call save_research now with what you found." });
  }
  throw new Error("Research didn't finish. Try again in a minute.");
}

// ---------------------------------------------------------------------------------------------
// Applying the result

const PROFILE_FIELDS = ["headquarters", "ownership", "ticker", "maturity", "description", "keyProducts", "customers", "buyerPersonas", "footprint",
  "growthScore", "growthThesis", "marketPositionScore", "equityUpsideScore", "compCompetitiveness", "assessmentRationale", "risks", "cultureNotes"] as const;
const FINANCE_FIELDS = ["revenue", "revenueGrowth", "fundingSummary", "valuation", "investors", "liquidityNotes"] as const;
const SCORE_FIELDS = new Set(["growthScore", "marketPositionScore", "equityUpsideScore", "compCompetitiveness"]);
export const FIELD_LABEL: Record<string, string> = {
  headquarters: "headquarters", ownership: "ownership", ticker: "ticker", maturity: "maturity", description: "business & positioning", keyProducts: "key products",
  customers: "major customers", buyerPersonas: "buyer personas", footprint: "footprint", growthScore: "growth potential", growthThesis: "growth thesis",
  marketPositionScore: "market position", equityUpsideScore: "equity upside", compCompetitiveness: "comp competitiveness", assessmentRationale: "why attractive",
  risks: "risks", cultureNotes: "culture", revenue: "revenue", revenueGrowth: "revenue growth", fundingSummary: "funding", valuation: "valuation", investors: "investors",
  liquidityNotes: "liquidity", website: "website", linkedinUrl: "LinkedIn page", careersUrl: "careers page",
};

/** Fields she typed or changed herself (from the audit trail). Research never overwrites them. */
export async function herFields(db: PrismaClient, companyId: string): Promise<Set<string>> {
  const logs = await db.auditLog.findMany({ where: { entity: "Company", entityId: companyId, action: { in: ["create", "update"] }, userId: { not: null } }, select: { action: true, changes: true } });
  const out = new Set<string>();
  for (const l of logs) for (const k of Object.keys((l.changes as Record<string, unknown> | null) ?? {})) out.add(k);
  out.delete("atsHint");
  return out;
}

const empty = (v: unknown) => v == null || (typeof v === "string" && v.trim() === "");

export type ResearchPlan = { data: Prisma.CompanyUpdateInput; written: string[]; kept: string[]; leaders: Prisma.LeaderCreateManyInput[]; news: Prisma.CompanyNewsCreateManyInput[]; hint: string | null; sources: { title: string; url: string }[] };

/** Decides what the research changes. Pure, so it can be tested without a database or the API. */
export function planResearch(c: Company & { leaders: { name: string }[]; news: { headline: string; url: string | null }[] }, r: ResearchResult, seen: Set<string>, mine: Set<string>, now = new Date()): ResearchPlan {
  const data: Record<string, unknown> = {};
  const written: string[] = [], kept: string[] = [];
  const sourced = (u: string | null | undefined): u is string => isHttp(u) && seen.has(normUrl(u));
  const put = (field: string, value: unknown) => {
    if (empty(value)) return;
    const cur = (c as unknown as Record<string, unknown>)[field];
    if (cur === value) return;
    if (mine.has(field) && !empty(cur)) { kept.push(field); return; }
    data[field] = value; written.push(field);
  };

  for (const f of PROFILE_FIELDS) put(f, r[f]);
  // Figures only with a source the search returned.
  if (sourced(r.financials.sourceUrl)) {
    const before = written.length;
    for (const f of FINANCE_FIELDS) put(f, r.financials[f]);
    if (written.length > before) { data.financialSourceUrl = r.financials.sourceUrl; data.financialVerifiedAt = now; }
  }
  // Links: fill gaps only, never replace one she has.
  if (empty(c.website) && isHttp(r.website)) { data.website = r.website.replace(/\/$/, ""); written.push("website"); }
  const site = (data.website as string | undefined) ?? c.website;
  if (site && !c.logoUrl) { try { data.logoUrl = `https://www.google.com/s2/favicons?domain=${new URL(site).hostname.replace(/^www\./, "")}&sz=128`; } catch { /* bad url */ } }
  if (isHttp(r.linkedinUrl) && /linkedin\.com\/company\//i.test(r.linkedinUrl) && (empty(c.linkedinUrl) || /linkedin\.com\/search\//i.test(c.linkedinUrl!)) && !mine.has("linkedinUrl")) { data.linkedinUrl = r.linkedinUrl; written.push("linkedinUrl"); }
  const hint = isHttp(r.jobBoardUrl) ? boardHintFromUrl(r.jobBoardUrl) ?? null : null;
  const guessedCareers = !c.careersUrl || (c.website && c.careersUrl === `${c.website.replace(/\/$/, "")}/careers`);
  if (isHttp(r.jobBoardUrl) && guessedCareers && !mine.has("careersUrl")) { data.careersUrl = r.jobBoardUrl; written.push("careersUrl"); }

  // The overview is now compiled from public sources, not entered or verified by her.
  if (written.some((f) => (PROFILE_FIELDS as readonly string[]).includes(f) && !SCORE_FIELDS.has(f))) {
    data.profileFactType = "AI_ASSESSMENT";
    data.profileSource = `Company research from ${r.sources.filter((x) => sourced(x.url)).length || seen.size} public sources, ${now.toISOString().slice(0, 10)}`;
    data.profileVerifiedAt = null;
  }

  const haveLeader = new Set(c.leaders.map((l) => l.name.trim().toLowerCase()));
  const leaders = r.leaders.filter((l) => sourced(l.sourceUrl) && !haveLeader.has(l.name.trim().toLowerCase()) && haveLeader.add(l.name.trim().toLowerCase()))
    .slice(0, 6).map((l) => ({ companyId: c.id, name: l.name, title: l.title, linkedinUrl: isHttp(l.linkedinUrl) && /linkedin\.com\/in\//i.test(l.linkedinUrl) ? l.linkedinUrl : null, sourceUrl: l.sourceUrl, factType: "AI_ASSESSMENT" as const }));

  const haveNews = new Set(c.news.flatMap((n) => [n.headline.trim().toLowerCase(), n.url ? normUrl(n.url) : ""]).filter(Boolean));
  const yearAgo = now.getTime() - 400 * 86400_000;
  const news = r.news.flatMap((n) => {
    const at = n.publishedAt && /^\d{4}-\d{2}-\d{2}/.test(n.publishedAt) ? new Date(n.publishedAt.slice(0, 10)) : null;
    if (!sourced(n.url) || (at && (isNaN(at.getTime()) || at.getTime() < yearAgo || at.getTime() > now.getTime() + 86400_000))) return [];
    const keys = [n.headline.trim().toLowerCase(), normUrl(n.url)];
    if (keys.some((k) => haveNews.has(k))) return [];
    keys.forEach((k) => haveNews.add(k));
    return [{ companyId: c.id, headline: n.headline, kind: (NEWS_KINDS as readonly string[]).includes(n.kind) ? n.kind : "product", url: n.url, publishedAt: at }];
  }).slice(0, 6);

  const sources = r.sources.filter((x) => sourced(x.url)).slice(0, 12).map((x) => ({ title: x.title.slice(0, 200) || x.url, url: x.url }));
  return { data: data as Prisma.CompanyUpdateInput, written, kept, leaders, news, hint, sources };
}

export function summarize(p: ResearchPlan, openings?: { created: number; status: string } | null) {
  const parts: string[] = [];
  parts.push(p.written.length ? `Updated ${p.written.length} field${p.written.length === 1 ? "" : "s"}` : "Profile already current");
  if (p.leaders.length) parts.push(`added ${p.leaders.length} leader${p.leaders.length === 1 ? "" : "s"}`);
  if (p.news.length) parts.push(`${p.news.length} recent development${p.news.length === 1 ? "" : "s"}`);
  if (openings) parts.push(openings.status === "ok" ? `${openings.created} new opening${openings.created === 1 ? "" : "s"}` : "no public job board found");
  let out = parts.join(", ") + ".";
  if (p.kept.length) out += ` Kept your edits to ${p.kept.map((f) => FIELD_LABEL[f] ?? f).join(", ")}.`;
  return out;
}

async function rescore(db: PrismaClient, companyId: string) {
  const c = await db.company.findUniqueOrThrow({ where: { id: companyId } });
  // In pages, so a large company never loads every job at once.
  for (let cursor: string | undefined; ;) {
    const jobs = await db.job.findMany({ where: { companyId, status: "OPEN" }, take: 200, orderBy: { id: "asc" }, ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}) });
    for (const j of jobs) {
      const r = scoreJob({ ...j, company: c });
      await db.job.update({ where: { id: j.id }, data: { score: r.score, scoreBreakdown: r.breakdown, scoreReasons: r.reasons, confidence: r.confidence, tier: r.tier, category: r.category, excludedReason: r.excludedReason ?? null } });
    }
    if (jobs.length < 200) break;
    cursor = jobs[jobs.length - 1].id;
  }
}

/** Researches one company and saves the result. Also refreshes its job board. */
export async function researchCompany(db: PrismaClient, companyId: string, deps: ResearchDeps = {}) {
  const c = await db.company.findUniqueOrThrow({ where: { id: companyId }, include: { leaders: { select: { name: true } }, news: { select: { headline: true, url: true } } } });
  await db.company.update({ where: { id: companyId }, data: { researchStatus: "running", researchStartedAt: new Date(), researchError: null } });
  try {
    const { result, seen } = await runResearch(c, deps);
    const plan = planResearch(c, result, seen, await herFields(db, companyId));
    const addHint = plan.hint && c.atsProvider === "NONE" && !c.atsHints.includes(plan.hint);
    const updated = await db.company.update({ where: { id: companyId }, data: {
      ...plan.data,
      ...(addHint ? { atsHints: { set: [...c.atsHints.filter((h) => h !== "none"), plan.hint!] }, atsStatus: "pending", atsError: null } : {}),
    } });
    if (plan.leaders.length) await db.leader.createMany({ data: plan.leaders });
    if (plan.news.length) await db.companyNews.createMany({ data: plan.news });
    if (plan.written.some((f) => SCORE_FIELDS.has(f))) await rescore(db, companyId);
    // Openings: the same per-company refresh as the "Refresh this company's jobs" button.
    const feed = await ingestCompany(db, updated, deps.fetch ?? fetch).catch((e: Error) => ({ status: "error", created: 0, error: e.message }));
    const summary = summarize(plan, feed);
    await db.company.update({ where: { id: companyId }, data: {
      researchStatus: "done", researchedAt: new Date(), researchSummary: summary, researchError: null,
      researchSources: plan.sources as unknown as Prisma.InputJsonValue, researchedFields: plan.written,
    } });
    await db.activity.create({ data: { companyId, kind: "research", body: summary } });
    await db.auditLog.create({ data: { userId: null, entity: "Company", entityId: companyId, action: "research", changes: { written: plan.written, kept: plan.kept, leaders: plan.leaders.length, news: plan.news.length } } });
    return { summary, plan };
  } catch (e) {
    const msg = e instanceof Anthropic.AuthenticationError ? "Anthropic rejected the API key. Check ANTHROPIC_API_KEY on the web service."
      : e instanceof Anthropic.RateLimitError ? "Anthropic is rate-limiting requests. Try again in a minute."
      : e instanceof z.ZodError ? "The research came back incomplete. Try again."
      : (e as Error).message || "Research failed";
    await db.company.update({ where: { id: companyId }, data: { researchStatus: "error", researchError: msg.slice(0, 500) } }).catch(() => null);
    throw e;
  }
}

// ---------------------------------------------------------------------------------------------
// Background queue: one research at a time, so the 512 MB web server never runs several at once.

let chain: Promise<unknown> = Promise.resolve();
const pending = new Set<string>();

export const researchConfigured = () => !!process.env.ANTHROPIC_API_KEY;

/** Is a research for this company under way? A "running" mark left by a restart counts as failed. */
export function researchActive(c: Pick<Company, "researchStatus" | "researchStartedAt">, now = Date.now()) {
  if (c.researchStatus !== "queued" && c.researchStatus !== "running") return false;
  return !!c.researchStartedAt && now - c.researchStartedAt.getTime() < RESEARCH_STALE_MS;
}

/** Queues research for a company and returns at once. The page polls for the result. */
export async function startResearch(db: PrismaClient, companyId: string, deps: ResearchDeps = {}) {
  if (pending.has(companyId)) return { started: false, status: "running" as const };
  pending.add(companyId);
  await db.company.update({ where: { id: companyId }, data: { researchStatus: pending.size > 1 ? "queued" : "running", researchStartedAt: new Date(), researchError: null } });
  const job = chain.then(() => researchCompany(db, companyId, deps)).catch((e) => console.error(`research ${companyId}:`, (e as Error).message)).finally(() => pending.delete(companyId));
  chain = job;
  return { started: true, status: "running" as const, done: job };
}

/** When she adds a company, research it in the background (if the API key is set). Never fails the add. */
export async function researchNewCompany(db: PrismaClient, companyId: string) {
  if (!researchConfigured()) return false;
  await startResearch(db, companyId).catch((e) => console.error("research start:", (e as Error).message));
  return true;
}
