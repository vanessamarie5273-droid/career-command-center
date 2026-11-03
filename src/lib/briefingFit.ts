// The briefing's per-job assessment: why it fits, what could block her, how to position herself, what to do today.
// Requirement checks are rule-based from the posting. The four-line assessment is written by Claude from her resume
// when a key is available (here, or through the web app), otherwise built from the same rules. Cached on the job.
import Anthropic from "@anthropic-ai/sdk";
import type { Company, Job, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { MODEL, assistantConfigured } from "./assistant";
import { appBase } from "./appUrl";
import { effectiveScore } from "./scoring";
import { keywordGap } from "./resume";
import { AZ_METRO, PROFILE } from "./profile";

export const ACTIONS = ["Apply", "Seek a referral", "Research further", "Pass"] as const;
export type FitAction = (typeof ACTIONS)[number];
export type FitBrief = { why: string[]; blocker: string; position: string; action: FitAction; reason: string; source: "ai" | "rules"; at: string };
export type Blocker = { kind: "clearance" | "location" | "travel" | "years" | "skill"; text: string; hard: boolean };
export type FitChecks = { strengths: string[]; met: string[]; required: string[]; preferred: string[]; blockers: Blocker[] };
type JobC = Job & { company: Company };

const RESIDES = /(?:must|should|need to|required to)\s+(?:reside|live|be located|be based)\s+(?:in|within)\s+([^.\n;]{3,90})|(?:open to|only considering|seeking)\s+candidates\s+(?:residing|located|based|who live)\s+in\s+([^.\n;]{3,90})/i;
const ALLOWS_AZ = /\b(arizona|az\b|phoenix|scottsdale|southwest|anywhere in the (u\.?s|united states)|any (u\.?s\.?|us) (state|location)|nationwide)/i;
const inAz = (s: string | null) => !!s && AZ_METRO.some((k) => s.toLowerCase().includes(k));

const ACRONYM: Record<string, string> = { ai: "AI", sled: "SLED", erp: "ERP", saas: "SaaS", cfo: "CFO", cio: "CIO", gtm: "GTM", sdr: "SDR", bdr: "BDR", ml: "ML", it: "IT", hcm: "HCM", crm: "CRM" };
const fixCase = (t: string) => t.replace(/\b[a-z]+\b/g, (w) => ACRONYM[w] ?? w);
const andList = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

/** Scoring reasons are terse ("Matches your experience in: cloud ai, complex sales"); restate them in plain, executive language. */
export function executive(reason: string) {
  const m = reason.match(/^Matches your experience in:\s*(.+)$/i);
  if (m) return `Aligns with your ${andList(m[1].split(/\s*,\s*/).slice(0, 3).map(fixCase))} track record`;
  const ote = reason.match(/^Published OTE up to (.+)$/i);
  if (ote) return `Published compensation of up to ${ote[1]} OTE`;
  return fixCase(reason);
}

export function fitChecks(job: Job, resumeText: string): FitChecks {
  const text = job.descriptionText ?? "";
  const reasons = (Array.isArray(job.scoreReasons) ? job.scoreReasons : []) as { delta?: string; text?: string }[];
  const strengths = reasons.filter((r) => r.delta === "+" && r.text).map((r) => executive(r.text!)).slice(0, 3);
  const gap = keywordGap(resumeText || PROFILE.facts.join("\n"), { text, required: job.requiredQuals, preferred: job.preferredQuals });
  const blockers: Blocker[] = [];
  if (job.requiresClearance) blockers.push({ kind: "clearance", text: "Requires a U.S. security clearance", hard: true });
  const res = text.match(RESIDES);
  const area = (res?.[1] ?? res?.[2])?.trim();
  if (area && !ALLOWS_AZ.test(area)) blockers.push({ kind: "location", text: `Limited to candidates in ${area}`, hard: true });
  else if (!job.isRemote && job.location && !inAz(job.location)) blockers.push({ kind: "location", text: `${job.workArrangement && job.workArrangement !== "Unknown" ? job.workArrangement : "Based"} in ${job.location}, not Phoenix`, hard: !job.relocationNotes });
  const travel = job.travelNotes ?? "";
  const pct = Number(travel.match(/(\d{2})\s*%/)?.[1] ?? 0);
  if (pct >= 30 || /extensive|frequent|significant/i.test(travel)) blockers.push({ kind: "travel", text: /travel/i.test(travel) ? travel.slice(0, 90) : `Travel: ${travel.slice(0, 90)}`, hard: false });
  if (job.yearsRequired && job.yearsRequired > PROFILE.yearsExperience + 3) blockers.push({ kind: "years", text: `Asks for ${job.yearsRequired}+ years; you have ${PROFILE.yearsExperience}+`, hard: false });
  const required = gap.recommendations.filter((r) => r.importance === "required" && !r.supported).map((r) => r.term);
  const preferred = gap.recommendations.filter((r) => r.importance === "preferred" && !r.supported).map((r) => r.term);
  for (const t of required.slice(0, 2)) blockers.push({ kind: "skill", text: `Requires ${fixCase(t)}, not shown on your resume`, hard: false });
  return { strengths, met: gap.matched.slice(0, 6).map((t) => fixCase(t).replace(/^./, (x) => x.toUpperCase())), required, preferred: preferred.map(fixCase), blockers };
}

const STOP = new Set(["with", "from", "that", "this", "your", "their", "into", "across", "sales", "senior", "years", "team", "revenue"]);
const words = (s: string) => new Set(s.toLowerCase().match(/[a-z]{4,}/g)?.filter((w) => !STOP.has(w)) ?? []);

/** The resume fact that overlaps the posting most. PROFILE.facts mirrors her resume. */
export function bestAccomplishment(job: Job, n = 1) {
  const jw = words(`${job.title} ${job.descriptionText ?? ""}`);
  return PROFILE.facts.map((f, i) => ({ f, s: [...words(f)].filter((w) => jw.has(w)).length - i * 0.01 })).sort((a, b) => b.s - a.s).slice(0, n).map((x) => x.f);
}

export function ruleFit(job: Job, checks: FitChecks, ctx: { connections: number; minScore: number }, now = new Date()): FitBrief {
  const why = [...checks.strengths];
  if (why.length < 2 && checks.met.length) why.push(`The posting calls for ${andList(checks.met.slice(0, 3).map(fixCase))}, all demonstrated on your resume`);
  while (why.length < 2) why.push(bestAccomplishment(job, 2)[why.length] ?? PROFILE.facts[0]);
  const hard = checks.blockers.find((b) => b.hard);
  const first = hard ?? checks.blockers[0];
  const score = effectiveScore(job) ?? 0;
  let action: FitAction = "Apply", reason = "Strong alignment and no disqualifying requirements.";
  if (hard?.kind === "clearance") { action = "Pass"; reason = "The security clearance requirement rules this role out."; }
  else if (hard) { action = "Research further"; reason = "Confirm Arizona eligibility with the recruiter before applying."; }
  else if (ctx.connections > 0) { action = "Seek a referral"; reason = `${ctx.connections} first-degree connection${ctx.connections > 1 ? "s" : ""} at the company; a referral will improve visibility.`; }
  else if (score < ctx.minScore) { action = "Research further"; reason = "Below your alert threshold; validate the team and territory first."; }
  const sentence = (t: string) => (/[.!?]$/.test(t.trim()) ? t.trim() : `${t.trim()}.`);
  return { why: why.slice(0, 2).map(sentence), blocker: first ? first.text : "No disqualifying requirements identified.", position: bestAccomplishment(job)[0], action, reason, source: "rules", at: now.toISOString() };
}

const Out = z.array(z.object({ id: z.string(), why: z.array(z.string()).min(1).max(3), blocker: z.string(), position: z.string(), action: z.enum(ACTIONS), reason: z.string() }));

const SYSTEM = `You assess job fit for Vanessa, a senior enterprise sales executive, for her daily briefing.
FACT RULES (absolute): anything about her comes only from RESUME. Never invent, round or combine figures. Facts about a job come only from its posting fields and the CHECKS given. If a requirement is not evidenced in the resume, it is a gap, never a strength.
For each job return: why = exactly two specific connections between the posting and her resume (one sentence each, name the resume fact); blocker = the single requirement she most needs to address, or "No hard requirement you're missing" if none (treat CHECKS blockers marked hard as decisive); position = the one resume accomplishment to lead with, quoted closely; action = one of Apply, Seek a referral, Research further, Pass; reason = one short sentence for the action. Prefer "Seek a referral" when connections > 0 and there is no hard blocker. Use "Pass" for a clearance requirement.
Reply with only a JSON array: [{"id","why":[..2],"blocker","position","action","reason"}].`;

export async function aiFit(jobs: JobC[], checks: Map<string, FitChecks>, resumeText: string, connections: Map<string, number>, now = new Date()): Promise<Map<string, FitBrief>> {
  const client = new Anthropic();
  const body = jobs.map((j) => {
    const c = checks.get(j.id)!;
    return [`JOB id=${j.id}`, `${j.title} at ${j.company.name} (${j.location ?? "location not listed"}${j.isRemote ? ", remote" : ""})`,
      `Required: ${(j.requiredQuals ?? "not separated").slice(0, 1500)}`, `Preferred: ${(j.preferredQuals ?? "none listed").slice(0, 800)}`,
      j.requiredQuals ? "" : `Posting: ${(j.descriptionText ?? "").slice(0, 2500)}`,
      `CHECKS: blockers=${JSON.stringify(c.blockers)} required_not_on_resume=${JSON.stringify(c.required)} preferred_not_on_resume=${JSON.stringify(c.preferred)}`,
      `connections at company: ${connections.get(j.companyId) ?? 0}`].filter(Boolean).join("\n");
  }).join("\n\n");
  const res = await client.messages.create({
    model: MODEL, max_tokens: 4000, output_config: { effort: "low" },
    system: SYSTEM,
    messages: [{ role: "user", content: `RESUME:\n${resumeText.slice(0, 20000)}\n\n${body}` }],
  });
  const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
  const parsed = Out.parse(JSON.parse(text.slice(text.indexOf("["), text.lastIndexOf("]") + 1)));
  const out = new Map<string, FitBrief>();
  for (const p of parsed) if (jobs.some((j) => j.id === p.id)) out.set(p.id, { why: p.why.slice(0, 2), blocker: p.blocker, position: p.position, action: p.action, reason: p.reason, source: "ai", at: now.toISOString() });
  return out;
}

export async function latestResumeText(db: PrismaClient) {
  const doc = await db.document.findFirst({ where: { kind: "resume", isTailored: false }, orderBy: { createdAt: "desc" }, select: { text: true } });
  return doc?.text?.trim() || PROFILE.facts.join("\n");
}

/** Asks the web app (which holds the Anthropic key) to write the assessments when this process has no key. */
async function delegate(db: PrismaClient, jobIds: string[]) {
  const base = await appBase(db), secret = process.env.CRON_SECRET;
  if (!base || !secret) return false;
  const r = await fetch(`${base}/api/briefing/fit`, { method: "POST", headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" }, body: JSON.stringify({ jobIds }), signal: AbortSignal.timeout(180000) }).catch(() => null);
  return !!r?.ok;
}

/**
 * Returns a fit assessment for each job, reusing a cached one unless the posting changed since. Prefers Claude
 * (here or via the web app) and falls back to the rules, so the briefing never waits on a missing key.
 */
export async function ensureFitBriefs(db: PrismaClient, jobs: JobC[], ctx: { connections: Map<string, number>; minScore: number; allowDelegate?: boolean }, now = new Date()) {
  const resumeText = await latestResumeText(db);
  const checks = new Map(jobs.map((j) => [j.id, fitChecks(j, resumeText)]));
  const changedSince = async (j: JobC) => !j.fitBriefAt || !!(await db.jobEvent.findFirst({ where: { jobId: j.id, kind: { in: ["updated", "reopened"] }, at: { gt: j.fitBriefAt } }, select: { id: true } }));
  const ai = assistantConfigured();
  const need: JobC[] = [];
  for (const j of jobs) {
    const cached = j.fitBrief as FitBrief | null;
    if (!cached || (await changedSince(j)) || (cached.source === "rules" && (ai || ctx.allowDelegate))) need.push(j);
  }
  if (need.length && ai) {
    const got = await aiFit(need, checks, resumeText, ctx.connections, now).catch((e) => { console.error("Briefing fit", e); return new Map<string, FitBrief>(); });
    for (const [id, brief] of got) await db.job.update({ where: { id }, data: { fitBrief: brief, fitBriefAt: now } });
  } else if (need.length && ctx.allowDelegate && (await delegate(db, need.map((j) => j.id)))) {
    // The web app stored them; fall through to read them back.
  }
  const fresh = new Map((await db.job.findMany({ where: { id: { in: jobs.map((j) => j.id) } }, select: { id: true, fitBrief: true, fitBriefAt: true } })).map((j) => [j.id, j]));
  const out = new Map<string, { fit: FitBrief; checks: FitChecks }>();
  for (const j of jobs) {
    const f = fresh.get(j.id);
    let fit = f?.fitBrief as FitBrief | null;
    if (!fit || (need.includes(j) && (!f?.fitBriefAt || f.fitBriefAt < now))) {
      fit = ruleFit(j, checks.get(j.id)!, { connections: ctx.connections.get(j.companyId) ?? 0, minScore: ctx.minScore }, now);
      await db.job.update({ where: { id: j.id }, data: { fitBrief: fit, fitBriefAt: now } });
    }
    out.set(j.id, { fit, checks: checks.get(j.id)! });
  }
  return out;
}
