import type { PrismaClient } from "@prisma/client";
import { sendEmail } from "./email";
import { effectiveScore, effectiveTier } from "./scoring";

const DAY = 86400000;
const ACTIVE_STAGES = ["APPLIED", "RECRUITER_CONTACT", "HIRING_MANAGER", "INTERVIEWING", "FINAL_INTERVIEW", "OFFER"] as const;

export type BriefingContent = {
  generatedAt: string;
  lastRun: { at: string | null; status: string | null; created: number; closed: number; errors: number } | null;
  newJobs: { id: string; title: string; company: string; score: number | null; tier: string | null; location: string | null; url: string }[];
  tier1: { id: string; title: string; company: string; score: number | null; applied: boolean; url: string }[];
  closedJobs: { id: string; title: string; company: string }[];
  companyNews: { company: string; headline: string; kind: string; url: string | null }[];
  upcomingInterviews: { id: string; title: string; company: string; at: string }[];
  followUps: { id: string; title: string; company: string; due: string | null; action: string | null }[];
  actions: string[];
};

export async function buildBriefing(db: PrismaClient, now = new Date()): Promise<BriefingContent> {
  const since = new Date(now.getTime() - DAY);
  const lastRun = await db.ingestionRun.findFirst({ where: { finishedAt: { not: null } }, orderBy: { startedAt: "desc" } });
  const newJobs = await db.job.findMany({ where: { firstSeenAt: { gte: since }, status: "OPEN", category: { in: ["MAIN", "STRETCH"] }, dismissed: false }, include: { company: true }, orderBy: { score: "desc" }, take: 25 });
  const openRanked = await db.job.findMany({ where: { status: "OPEN", category: "MAIN", dismissed: false }, include: { company: true, applications: true }, orderBy: { score: "desc" }, take: 200 });
  const tier1 = openRanked.filter((j) => effectiveTier(j) === "TIER1").slice(0, 15);
  const closedJobs = await db.job.findMany({ where: { closedAt: { gte: since } }, include: { company: true }, take: 25 });
  const news = await db.companyNews.findMany({ where: { createdAt: { gte: new Date(now.getTime() - 7 * DAY) } }, include: { company: true }, take: 15 });
  const interviews = await db.application.findMany({ where: { interviewAt: { gte: now, lte: new Date(now.getTime() + 7 * DAY) } }, include: { company: true }, orderBy: { interviewAt: "asc" } });
  const followUps = await db.application.findMany({ where: { nextActionDue: { lte: new Date(now.getTime() + DAY) }, stage: { notIn: ["ACCEPTED", "REJECTED", "WITHDRAWN"] } }, include: { company: true }, orderBy: { nextActionDue: "asc" } });
  const actions: string[] = [];
  const unapplied = tier1.filter((j) => !j.applications.some((a) => a.applied));
  if (unapplied.length) actions.push(`Apply to ${Math.min(unapplied.length, 3)} Tier 1 role${unapplied.length > 1 ? "s" : ""}: ${unapplied.slice(0, 3).map((j) => `${j.title} at ${j.company.name}`).join("; ")}`);
  if (followUps.length) actions.push(`Complete ${followUps.length} due follow-up${followUps.length > 1 ? "s" : ""}, starting with ${followUps[0].company.name}`);
  if (interviews.length) actions.push(`Prepare for ${interviews[0].company.name} interview on ${interviews[0].interviewAt!.toDateString()}`);
  if (lastRun && lastRun.errors > 0) actions.push(`${lastRun.errors} job feeds failed in the last refresh; review Settings & Integrations`);
  const base = process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || "";
  return {
    generatedAt: now.toISOString(),
    lastRun: lastRun ? { at: lastRun.finishedAt?.toISOString() ?? null, status: lastRun.status, created: lastRun.created, closed: lastRun.closed, errors: lastRun.errors } : null,
    newJobs: newJobs.map((j) => ({ id: j.id, title: j.title, company: j.company.name, score: effectiveScore(j), tier: effectiveTier(j), location: j.location, url: j.applyUrl })),
    tier1: tier1.map((j) => ({ id: j.id, title: j.title, company: j.company.name, score: effectiveScore(j), applied: j.applications.some((a) => a.applied), url: `${base}/jobs/${j.id}` })),
    closedJobs: closedJobs.map((j) => ({ id: j.id, title: j.title, company: j.company.name })),
    companyNews: news.map((n) => ({ company: n.company.name, headline: n.headline, kind: n.kind, url: n.url })),
    upcomingInterviews: interviews.map((a) => ({ id: a.id, title: a.title, company: a.company.name, at: a.interviewAt!.toISOString() })),
    followUps: followUps.map((a) => ({ id: a.id, title: a.title, company: a.company.name, due: a.nextActionDue?.toISOString() ?? null, action: a.nextAction })),
    actions,
  };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function briefingHtml(b: BriefingContent) {
  const base = process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || "";
  const li = (items: string[]) => (items.length ? `<ul>${items.map((i) => `<li>${i}</li>`).join("")}</ul>` : `<p style="color:#64748b">None</p>`);
  return `<div style="font-family:Inter,Arial,sans-serif;max-width:640px;color:#0f172a">
  <div style="background:#0b1730;color:#e6d39b;padding:16px 20px;font-size:18px;font-weight:600">Career Command Center · Morning Briefing</div>
  <div style="padding:16px 20px">
  <p style="color:#64748b">Generated ${new Date(b.generatedAt).toLocaleString("en-US", { timeZone: "America/Phoenix" })} (Arizona). Last job refresh: ${b.lastRun?.at ? new Date(b.lastRun.at).toLocaleString("en-US", { timeZone: "America/Phoenix" }) : "never"}${b.lastRun ? `, ${b.lastRun.created} new, ${b.lastRun.closed} closed, ${b.lastRun.errors} feed errors` : ""}.</p>
  <h3>Recommended actions</h3>${li(b.actions.map(esc))}
  <h3>New matching jobs (last 24h)</h3>${li(b.newJobs.map((j) => `<a href="${base}/jobs/${j.id}">${esc(j.title)}</a> · ${esc(j.company)} · ${j.score ?? "–"} pts${j.location ? ` · ${esc(j.location)}` : ""}`))}
  <h3>Tier 1 opportunities</h3>${li(b.tier1.map((j) => `<a href="${j.url}">${esc(j.title)}</a> · ${esc(j.company)} · ${j.score} pts${j.applied ? " · applied" : ""}`))}
  <h3>Upcoming interviews</h3>${li(b.upcomingInterviews.map((i) => `${esc(i.company)}: ${esc(i.title)} · ${new Date(i.at).toLocaleString("en-US", { timeZone: "America/Phoenix" })}`))}
  <h3>Follow-ups due</h3>${li(b.followUps.map((f) => `${esc(f.company)}: ${esc(f.action || f.title)}${f.due ? ` · due ${new Date(f.due).toLocaleDateString()}` : ""}`))}
  <h3>Company developments</h3>${li(b.companyNews.map((n) => `${esc(n.company)}: ${n.url ? `<a href="${esc(n.url)}">${esc(n.headline)}</a>` : esc(n.headline)}`))}
  <h3>Jobs that closed</h3>${li(b.closedJobs.map((j) => `${esc(j.title)} · ${esc(j.company)}`))}
  </div></div>`;
}

export async function generateAndSendBriefing(db: PrismaClient) {
  const content = await buildBriefing(db);
  const lastRun = await db.ingestionRun.findFirst({ orderBy: { startedAt: "desc" } });
  const user = await db.user.findFirst({ orderBy: { createdAt: "asc" } });
  const to = user?.alertEmail || user?.email;
  let emailStatus = "not_sent";
  if (to) {
    const r = await sendEmail(to, `Morning briefing: ${content.newJobs.length} new matches, ${content.tier1.length} Tier 1`, briefingHtml(content));
    emailStatus = r.detail;
    await db.integrationStatus.upsert({ where: { id: "email" }, create: { id: "email", name: "Email (Resend)", status: r.ok ? "connected" : r.detail.includes("not configured") ? "not_configured" : "error", detail: r.detail }, update: { status: r.ok ? "connected" : r.detail.includes("not configured") ? "not_configured" : "error", detail: r.detail, checkedAt: new Date() } });
  }
  return db.briefing.create({ data: { content, basedOnRun: lastRun?.id, emailedTo: to, emailStatus } });
}

export { ACTIVE_STAGES };
