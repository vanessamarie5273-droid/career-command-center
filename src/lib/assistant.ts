// Natural-language command center: Claude answers from the database through read-only tools.
import Anthropic from "@anthropic-ai/sdk";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { MATCHING, tierWhere, followUpWhere } from "./queries";
import { companyAttractiveness, effectiveScore, effectiveTier } from "./scoring";
import { keywordGap } from "./resume";
import { PROFILE } from "./profile";

export const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
export const assistantConfigured = () => !!process.env.ANTHROPIC_API_KEY;

const pay = (j: { oteMin: number | null; oteMax: number | null; salaryMin: number | null; salaryMax: number | null }) =>
  j.oteMax ?? j.oteMin ? `OTE up to $${Math.round((j.oteMax ?? j.oteMin)! / 1000)}K (published)` : j.salaryMax ?? j.salaryMin ? `pay up to $${Math.round((j.salaryMax ?? j.salaryMin)! / 1000)}K (published)` : "pay not published";

const jobRow = (j: Prisma.JobGetPayload<{ include: { company: true; applications: true } }>) => ({
  record: `/jobs/${j.id}`, job_id: j.id, title: j.title, company: j.company.name, industry: j.company.category, score: effectiveScore(j), tier: effectiveTier(j), confidence: j.confidence,
  category: j.category, location: j.location, arrangement: j.workArrangement, compensation: pay(j), posted: j.postedAt?.toISOString().slice(0, 10) ?? null,
  first_found: j.firstSeenAt.toISOString().slice(0, 10), last_verified: j.lastVerifiedAt.toISOString(), status: j.status, apply_url: j.applyUrl,
  application: j.applications[0] ? { record: `/applications/${j.applications[0].id}`, stage: j.applications[0].stage, applied: j.applications[0].applied } : null,
});

const TOOLS: Anthropic.Tool[] = [
  { name: "search_jobs", description: "Search verified job openings in the database. Returns ranked rows with score, tier, published pay, location, record link and employer apply URL. Only OPEN jobs unless include_closed.", input_schema: { type: "object", properties: {
    text: { type: "string", description: "Keyword in title, company, location or description" }, tier: { type: "string", enum: ["TIER1", "TIER2", "TIER3"] }, remote_only: { type: "boolean" },
    min_published_pay: { type: "number", description: "Minimum published OTE or pay (USD)" }, industry: { type: "string" }, company: { type: "string" }, not_applied: { type: "boolean" },
    category: { type: "string", enum: ["MAIN", "STRETCH", "RELOCATION", "EXCLUDED"] }, found_within_days: { type: "number" }, sort: { type: "string", enum: ["score", "pay", "newest"] }, limit: { type: "number" }, include_closed: { type: "boolean" },
  } } },
  { name: "get_job", description: "Full details of one job, including score breakdown and reasons, qualifications and description excerpt.", input_schema: { type: "object", properties: { job_id: { type: "string" } }, required: ["job_id"] } },
  { name: "get_companies", description: "Company profiles (AI-compiled unless verified), assessment scores, verified financials if any, open matching roles, my applications and contacts. Accepts several names.", input_schema: { type: "object", properties: { names: { type: "array", items: { type: "string" } } }, required: ["names"] } },
  { name: "rank_companies", description: "Rank companies by attractiveness or by an assessment field, optionally within an industry. Also reports open matching roles and whether I have applied.", input_schema: { type: "object", properties: { industry: { type: "string" }, by: { type: "string", enum: ["attractiveness", "equity", "compensation", "market_position"] }, without_application: { type: "boolean" }, only_with_tier1: { type: "boolean" }, limit: { type: "number" } } } },
  { name: "list_applications", description: "My applications with stage, dates, next action and follow-up status.", input_schema: { type: "object", properties: { stage: { type: "string" }, overdue_only: { type: "boolean" } } } },
  { name: "hiring_leaders", description: "Leaders and contacts recorded for companies (with fact type and source), plus LinkedIn search links for roles not yet recorded. Never invent names.", input_schema: { type: "object", properties: { names: { type: "array", items: { type: "string" } } }, required: ["names"] } },
  { name: "resumes_for_job", description: "Rank my uploaded resumes against a job by keyword coverage and list gaps.", input_schema: { type: "object", properties: { job_id: { type: "string" } }, required: ["job_id"] } },
];

async function findCompanies(names: string[]) {
  const out = [];
  for (const n of names.slice(0, 12)) {
    const c = await prisma.company.findFirst({ where: { name: { contains: n.trim(), mode: "insensitive" } }, include: { jobs: { where: MATCHING, orderBy: { score: "desc" }, take: 8, include: { company: true, applications: true } }, applications: true, leaders: true, contacts: true, news: { take: 5, orderBy: { createdAt: "desc" } } } });
    if (c) out.push(c);
  }
  return out;
}

export async function runTool(name: string, input: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case "search_jobs": {
      const and: Prisma.JobWhereInput[] = [input.include_closed ? {} : { status: "OPEN", dismissed: false }];
      and.push(input.category ? { category: String(input.category) } : { category: { in: ["MAIN", "STRETCH", "RELOCATION"] } });
      if (input.tier) and.push(tierWhere(input.tier as "TIER1"));
      if (input.remote_only) and.push({ isRemote: true });
      if (input.min_published_pay) and.push({ OR: [{ oteMax: { gte: Number(input.min_published_pay) } }, { salaryMax: { gte: Number(input.min_published_pay) } }] });
      if (input.industry) and.push({ company: { category: { contains: String(input.industry), mode: "insensitive" } } });
      if (input.company) and.push({ company: { name: { contains: String(input.company), mode: "insensitive" } } });
      if (input.not_applied) and.push({ applications: { none: { applied: true } } });
      if (input.found_within_days) and.push({ firstSeenAt: { gte: new Date(Date.now() - Number(input.found_within_days) * 86400000) } });
      if (input.text) { const t = String(input.text); and.push({ OR: [{ title: { contains: t, mode: "insensitive" } }, { company: { name: { contains: t, mode: "insensitive" } } }, { location: { contains: t, mode: "insensitive" } }, { descriptionText: { contains: t, mode: "insensitive" } }] }); }
      const orderBy: Prisma.JobOrderByWithRelationInput[] = input.sort === "pay" ? [{ oteMax: { sort: "desc", nulls: "last" } }, { salaryMax: { sort: "desc", nulls: "last" } }] : input.sort === "newest" ? [{ firstSeenAt: "desc" }] : [{ overrideScore: { sort: "desc", nulls: "last" } }, { score: "desc" }];
      const jobs = await prisma.job.findMany({ where: { AND: and }, orderBy, take: Math.min(Number(input.limit) || 15, 40), include: { company: true, applications: true } });
      const total = await prisma.job.count({ where: { AND: and } });
      return { total_matching: total, jobs: jobs.map(jobRow) };
    }
    case "get_job": {
      const j = await prisma.job.findUnique({ where: { id: String(input.job_id) }, include: { company: true, applications: true } });
      if (!j) return { error: "No such job" };
      return { ...jobRow(j), score_breakdown: j.scoreBreakdown, reasons: j.scoreReasons, required_qualifications: j.requiredQuals, preferred_qualifications: j.preferredQuals, years_required: j.yearsRequired, territory: j.territory, travel: j.travelNotes, description_excerpt: (j.descriptionText || "").slice(0, 6000) };
    }
    case "get_companies": {
      const cs = await findCompanies((input.names as string[]) || []);
      return cs.map((c) => ({
        record: `/companies/${c.id}`, name: c.name, industry: c.category, hq: c.headquarters, ownership: c.ownership, ticker: c.ticker, maturity: c.maturity,
        profile: { description: c.description, products: c.keyProducts, buyers: c.buyerPersonas, fact_type: c.profileFactType, verified_at: c.profileVerifiedAt },
        verified_financials: c.financialVerifiedAt ? { revenue: c.revenue, growth: c.revenueGrowth, funding: c.fundingSummary, valuation: c.valuation, source: c.financialSourceUrl, verified_at: c.financialVerifiedAt } : "none recorded",
        ai_assessment: { attractiveness: companyAttractiveness(c), market_position: c.marketPositionScore, equity_upside: c.equityUpsideScore, comp_competitiveness: c.compCompetitiveness, risks: c.risks },
        total_openings_at_company: c.totalOpenings, open_matching_roles: c.jobs.map(jobRow), my_applications: c.applications.map((a) => ({ record: `/applications/${a.id}`, title: a.title, stage: a.stage, applied: a.applied })),
        developments: c.news.map((n) => ({ headline: n.headline, url: n.url })),
      }));
    }
    case "rank_companies": {
      const cs = await prisma.company.findMany({ where: { AND: [input.industry ? { category: { contains: String(input.industry), mode: "insensitive" } } : {}, input.without_application ? { applications: { none: { applied: true } } } : {}] }, include: { jobs: { where: MATCHING, select: { tier: true, overrideTier: true, score: true } } } });
      const key = (c: (typeof cs)[number]) => input.by === "equity" ? c.equityUpsideScore ?? 0 : input.by === "compensation" ? c.compCompetitiveness ?? 0 : input.by === "market_position" ? c.marketPositionScore ?? 0 : companyAttractiveness(c);
      return cs.filter((c) => !input.only_with_tier1 || c.jobs.some((j) => (j.overrideTier ?? j.tier) === "TIER1")).sort((a, b) => key(b) - key(a)).slice(0, Math.min(Number(input.limit) || 15, 50)).map((c) => ({ record: `/companies/${c.id}`, name: c.name, industry: c.category, ownership: c.ownership, maturity: c.maturity, value: key(c), basis: "AI assessment", open_matching_roles: c.jobs.length, tier1_roles: c.jobs.filter((j) => (j.overrideTier ?? j.tier) === "TIER1").length }));
    }
    case "list_applications": {
      const where: Prisma.ApplicationWhereInput = input.overdue_only ? followUpWhere() : input.stage ? { stage: String(input.stage) as never } : {};
      const apps = await prisma.application.findMany({ where, include: { company: true }, orderBy: { updatedAt: "desc" }, take: 60 });
      return apps.map((a) => ({ record: `/applications/${a.id}`, company: a.company.name, title: a.title, stage: a.stage, applied: a.applied, applied_at: a.appliedAt, next_action: a.nextAction, due: a.nextActionDue, interview_at: a.interviewAt }));
    }
    case "hiring_leaders": {
      const cs = await findCompanies((input.names as string[]) || []);
      return cs.map((c) => ({ company: c.name, record: `/companies/${c.id}`, recorded_leaders: c.leaders.map((l) => ({ name: l.name, title: l.title, fact_type: l.factType, source: l.sourceUrl, linkedin: l.linkedinUrl })), my_contacts: c.contacts.map((p) => ({ name: `${p.firstName} ${p.lastName ?? ""}`.trim(), title: p.title, degree: p.degree, linkedin: p.linkedinUrl })), linkedin_searches: ["Chief Revenue Officer", "VP Sales", "Director Sales Development", "Sales Recruiter"].map((r) => ({ role: r, url: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${r} ${c.name}`)}` })) }));
    }
    case "resumes_for_job": {
      const j = await prisma.job.findUnique({ where: { id: String(input.job_id) } });
      if (!j) return { error: "No such job" };
      const docs = await prisma.document.findMany({ where: { kind: "resume" }, select: { id: true, name: true, version: true, text: true } });
      if (!docs.length) return { note: "No resumes uploaded yet" };
      return docs.map((d) => { const g = keywordGap(d.text || "", { text: j.descriptionText || "", required: j.requiredQuals, preferred: j.preferredQuals }); return { record: `/documents/${d.id}`, name: d.name, version: d.version, coverage_pct: g.matchScore, missing_required: g.recommendations.filter((r) => r.importance === "required").map((r) => r.term) }; }).sort((a, b) => (b.coverage_pct ?? 0) - (a.coverage_pct ?? 0));
    }
  }
  return { error: `Unknown tool ${name}` };
}

const SYSTEM = `You are the assistant inside Vanessa's private Career Command Center. Answer from the database through your tools; never from memory about job openings, pay, valuations, or people.

Her profile (her own statements; do not embellish): ${PROFILE.summary}
Home base: ${PROFILE.homeBase}. Prefers remote U.S., Southwest territories, or hybrid near Phoenix; relocation roles are a separate category; roles needing an active security clearance are excluded.

Rules:
- Cite every job, company or application you mention with its record link in markdown, e.g. [Strategic AE, Databricks](/jobs/abc), and include the employer apply URL when recommending an application.
- Distinguish confirmed facts (published by the employer, verified sources) from AI assessments (company scores, profiles not yet verified). Say "pay not published" rather than estimating a salary.
- Never invent jobs, people, compensation, financials or achievements. If the database lacks something, say so and suggest how to fill it (a refresh, adding a source, LinkedIn search link).
- A company with no open suitable role is a monitoring target, never an immediate application.
- Be concise and action-oriented: lead with the answer, then a short ranked list. Today is ${new Date().toISOString().slice(0, 10)}.`;

export async function ask(history: Anthropic.MessageParam[]) {
  const client = new Anthropic();
  const messages: Anthropic.MessageParam[] = [...history];
  const used: { tool: string; input: unknown }[] = [];
  for (let i = 0; i < 8; i++) {
    // Server-side refusal fallback ("default" routing) keeps answers flowing if a request is declined.
    const res = await client.beta.messages.create({
      model: MODEL, max_tokens: 16000, system: SYSTEM, tools: TOOLS, tool_choice: { type: "auto" }, messages: messages as Anthropic.Beta.BetaMessageParam[],
      output_config: { effort: "medium" }, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
    });
    if (res.stop_reason === "refusal") return { text: "The assistant declined this request.", used };
    messages.push({ role: "assistant", content: res.content as Anthropic.ContentBlockParam[] });
    if (res.stop_reason !== "tool_use") {
      const text = res.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("\n");
      return { text, used };
    }
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const b of res.content) {
      if (b.type !== "tool_use") continue;
      used.push({ tool: b.name, input: b.input });
      try { results.push({ type: "tool_result", tool_use_id: b.id, content: JSON.stringify(await runTool(b.name, b.input as Record<string, unknown>)) }); }
      catch (e) { results.push({ type: "tool_result", tool_use_id: b.id, content: (e as Error).message, is_error: true }); }
    }
    messages.push({ role: "user", content: results });
  }
  return { text: "I could not finish within the tool-call limit. Try a narrower question.", used };
}

export async function tailoringSuggestions(jobText: string, resumeText: string) {
  const client = new Anthropic();
  const res = await client.messages.create({
    model: MODEL, max_tokens: 8000, output_config: { effort: "medium" },
    system: "You help an executive tailor her resume to a job. Use ONLY facts present in her resume text. Never add titles, employers, dates, metrics, credentials or achievements that are not in the resume. Suggest re-ordering, re-wording and emphasis. For each job requirement not evidenced in the resume, say it is a gap to address in conversation, not something to add.",
    messages: [{ role: "user", content: `JOB DESCRIPTION:\n${jobText.slice(0, 30000)}\n\nRESUME:\n${resumeText.slice(0, 30000)}\n\nGive: 1) top 5 resume edits (quote the original line and the suggested rewrite), 2) a two-sentence summary line tailored to this role, 3) genuine gaps.` }],
  });
  return res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n");
}
