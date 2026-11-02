import type { Prisma, PrismaClient } from "@prisma/client";
import { alertAddress, deliver } from "./notify";
import { effectiveScore, effectiveTier } from "./scoring";
import { companyCap } from "./companyCap";
import { FEED_CATEGORIES, NOT_APPLIED } from "./queries";
import { appBase } from "./appUrl";
import { bestAccomplishment, ensureFitBriefs, type FitBrief, type FitChecks } from "./briefingFit";
import { FAMILY_LABEL, type RoleFamily } from "./roles";
import { KIND_LABEL } from "./mail/sync";
import { PROFILE } from "./profile";
import { STAGE_LABEL, range, titleCase } from "./format";

const DAY = 86400000;
const ACTIVE_STAGES = ["APPLIED", "RECRUITER_CONTACT", "HIRING_MANAGER", "INTERVIEWING", "FINAL_INTERVIEW", "OFFER"] as const;
const RESPONDED = ["RECRUITER_CONTACT", "HIRING_MANAGER", "INTERVIEWING", "FINAL_INTERVIEW", "OFFER", "ACCEPTED"] as const;
const CLOSED_STAGES = ["ACCEPTED", "REJECTED", "WITHDRAWN"] as const;

export type Priority = { kind: "interview" | "reply" | "followup" | "apply" | "referral"; title: string; reason: string; href: string };
export type Opportunity = {
  id: string; title: string; company: string; logo: string | null; pay: string | null; location: string | null; remote: boolean;
  postedAt: string | null; firstSeenAt: string; verifiedAt: string; applyUrl: string; href: string; score: number | null; tier: string | null;
  isNew: boolean; connections: number; fit: FitBrief; checks: FitChecks;
};
export type Urgent = { tone: "good" | "bad" | "info"; text: string; href: string };
export type TrackedChange = { kind: "pay" | "requirements" | "closed" | "reposted" | "other"; title: string; company: string; detail: string; at: string; href: string };
export type ProgressItem = { title: string; company: string; logo: string | null; stage: string; days: number; status: string; confirmed: boolean; basis: string; href: string };
export type Person = { name: string; title: string | null; company: string; context: string; reason: string; href: string };
export type FollowUp = { title: string; company: string; due: string | null; last: { who: string; when: string; channel: string; about: string } | null; suggestion: string; href: string };
export type Interview = { title: string; company: string; at: string; participants: string[]; priorities: string[]; accomplishments: string[]; prep: string[]; href: string };
export type News = { company: string; headline: string; kind: string; url: string; at: string; why: string };
export type Row = { label: string; sent: number; responded: number };
export type Working = { sent: number; responded: number; byFamily: Row[]; byResume: Row[]; byChannel: Row[]; patterns: string[]; note: string | null };

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
  // One-page briefing (v2). Absent on briefings generated before it shipped.
  v2?: {
    priorities: Priority[];
    opportunities: Opportunity[];
    noStrongMatches: boolean;
    minScore: number;
    urgent: Urgent[];
    changes: TrackedChange[];
    progress: { moved: ProgressItem[]; needsAction: ProgressItem[]; waiting: ProgressItem[] };
    people: Person[];
    followUps: FollowUp[];
    interviews: Interview[];
    news: News[];
    working: Working;
    stats: { active: number; waiting: number; interviews: number; responseRate: number | null; strongNew: number; pipeline: { stage: string; label: string; count: number }[] };
  };
};

const daysSince = (d: Date, now: Date) => Math.max(0, Math.floor((now.getTime() - d.getTime()) / DAY));
const short = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Phoenix" });
const first = (name: string | null | undefined) => (name ?? "").trim().split(/\s+/)[0] || null;
const payOf = (j: { oteMin: number | null; oteMax: number | null; salaryMin: number | null; salaryMax: number | null }) => {
  const ote = range(j.oteMin, j.oteMax), base = range(j.salaryMin, j.salaryMax);
  return ote ? `${ote} OTE` : base ? `${base} base` : null;
};
const SALES_LEADER = /\b(vp|vice president|head|director|chief|cro|regional|area|manager|leader)\b.*\b(sales|revenue|business development|growth|go-to-market|gtm|account)|\b(sales|revenue)\b.*\b(director|leader|vp|head)\b/i;
const RECRUITER = /\b(recruit|talent|sourc)/i;

/** How many of her LinkedIn connections and saved contacts work at each company. */
export async function connectionCounts(db: PrismaClient, companyIds: string[]) {
  const rows = await db.contact.groupBy({ by: ["companyId"], where: { companyId: { in: companyIds } }, _count: true });
  return new Map(rows.map((r) => [r.companyId!, r._count]));
}

/** The domain she sold into that best matches a posting, from her stated strengths, for suggested messages. */
function domainFor(text: string) {
  const t = text.toLowerCase();
  const order: [string, string][] = [["public sector", "state and local government"], ["healthcare", "healthcare and life sciences"], ["erp_finance", "Cloud ERP and finance transformation"], ["cloud_ai", "cloud, data and AI"], ["sdr_leadership", "sales development"]];
  return order.find(([k]) => PROFILE.strengths[k]?.some((w) => t.includes(w)))?.[1] ?? "enterprise software";
}

export async function buildBriefing(db: PrismaClient, now = new Date(), opts: { allowDelegate?: boolean } = {}): Promise<BriefingContent> {
  const since = new Date(now.getTime() - DAY);
  const prev = await db.briefing.findFirst({ where: { createdAt: { lt: now } }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
  // Changes since the last briefing, but never less than a day or more than three.
  const changeSince = new Date(Math.min(since.getTime(), Math.max(prev?.createdAt.getTime() ?? 0, now.getTime() - 3 * DAY)));
  const base = await appBase(db);
  const user = await db.user.findFirst({ orderBy: { createdAt: "asc" } });
  const minScore = user?.alertMinScore ?? 80;
  const lastRun = await db.ingestionRun.findFirst({ where: { finishedAt: { not: null } }, orderBy: { startedAt: "desc" } });
  const cap = await companyCap(db);
  const feed: Prisma.JobWhereInput = { id: { in: cap.ids }, status: "OPEN", category: { in: FEED_CATEGORIES }, dismissed: false, ...NOT_APPLIED };
  const newJobs = await db.job.findMany({ where: { ...feed, firstSeenAt: { gte: since } }, include: { company: true }, orderBy: { score: "desc" }, take: 25 });
  const openRanked = await db.job.findMany({ where: feed, include: { company: true, applications: true }, orderBy: { score: "desc" }, take: 200 });
  const tier1 = openRanked.filter((j) => effectiveTier(j) === "TIER1").slice(0, 15);
  const closedJobs = await db.job.findMany({ where: { closedAt: { gte: since } }, include: { company: true }, take: 25 });
  const news = await db.companyNews.findMany({ where: { createdAt: { gte: new Date(now.getTime() - 7 * DAY) } }, include: { company: true }, take: 40 });
  const interviews = await db.application.findMany({ where: { interviewAt: { gte: now, lte: new Date(now.getTime() + 7 * DAY) } }, include: { company: true, job: true, preps: { select: { kind: true } } }, orderBy: { interviewAt: "asc" } });
  const followUps = await db.application.findMany({ where: { nextActionDue: { lte: new Date(now.getTime() + DAY) }, stage: { notIn: [...CLOSED_STAGES] } }, include: { company: true }, orderBy: { nextActionDue: "asc" } });

  // ---- Applications and their history
  const apps = await db.application.findMany({
    where: { applied: true },
    include: { company: true, job: true, resume: { select: { name: true } }, stageHistory: { orderBy: { at: "asc" } }, touches: { include: { contact: true }, orderBy: { sentAt: "desc" } } },
  });
  const active = apps.filter((a) => (ACTIVE_STAGES as readonly string[]).includes(a.stage));
  const emailEvents = await db.emailEvent.findMany({ where: { applicationId: { in: apps.map((a) => a.id) } }, orderBy: { receivedAt: "desc" } });
  const eventsBy = new Map<string, typeof emailEvents>();
  for (const e of emailEvents) eventsBy.set(e.applicationId!, [...(eventsBy.get(e.applicationId!) ?? []), e]);
  const mail = await db.mailAccount.findUnique({ where: { id: "outlook" }, select: { status: true } });
  const appHref = (id: string) => `${base}/applications/${id}`;

  // ---- Opportunities: strong new roles first, else the best still-open ones
  const strongNew = newJobs.filter((j) => (effectiveScore(j) ?? 0) >= minScore);
  const seen = new Set<string>();
  const dedupe = <T extends { title: string; company: { name: string } }>(js: T[]) => js.filter((j) => { const k = `${j.company.name}|${j.title.toLowerCase()}`; if (seen.has(k)) return false; seen.add(k); return true; });
  const picks = dedupe(strongNew).slice(0, 5);
  if (picks.length < 5) picks.push(...dedupe(openRanked.filter((j) => (effectiveScore(j) ?? 0) >= minScore && !j.applications.length)).slice(0, (picks.length ? 5 : 3) - picks.length));
  const connections = await connectionCounts(db, [...new Set([...picks.map((j) => j.companyId), ...active.map((a) => a.companyId)])]);
  const fits = await ensureFitBriefs(db, picks, { connections, minScore, allowDelegate: opts.allowDelegate }, now);
  const opportunities: Opportunity[] = picks.map((j) => ({
    id: j.id, title: j.title, company: j.company.name, logo: j.company.logoUrl, pay: payOf(j), location: j.location, remote: j.isRemote,
    postedAt: j.postedAt?.toISOString() ?? null, firstSeenAt: j.firstSeenAt.toISOString(), verifiedAt: j.lastVerifiedAt.toISOString(), applyUrl: j.applyUrl, href: `${base}/jobs/${j.id}`,
    score: effectiveScore(j), tier: effectiveTier(j), isNew: j.firstSeenAt >= since, connections: connections.get(j.companyId) ?? 0, fit: fits.get(j.id)!.fit, checks: fits.get(j.id)!.checks,
  }));

  // ---- Changes to tracked jobs (applied, saved or starred)
  const tracked = await db.job.findMany({ where: { OR: [{ applications: { some: { stage: { notIn: ["REJECTED", "WITHDRAWN"] } } } }, { favorite: true }] }, select: { id: true } });
  const jobEvents = await db.jobEvent.findMany({ where: { jobId: { in: tracked.map((t) => t.id) }, at: { gte: changeSince }, kind: { in: ["updated", "reopened", "closed"] } }, include: { job: { include: { company: true } } }, orderBy: { at: "desc" } });
  const changes: TrackedChange[] = jobEvents
    .filter((e) => e.kind !== "updated" || (e.detail && !/^Merged duplicate/.test(e.detail)))
    .map((e) => ({ kind: e.kind === "closed" ? "closed" : e.kind === "reopened" ? "reposted" : /Pay/.test(e.detail ?? "") ? "pay" : /qualifications|clearance|Travel/.test(e.detail ?? "") ? "requirements" : "other", title: e.job.title, company: e.job.company.name, detail: e.kind === "closed" ? "Posting taken down" : e.detail ?? "Posting updated", at: e.at.toISOString(), href: `${base}/jobs/${e.jobId}` }) as TrackedChange);

  // ---- Application progress, confirmed vs assumed
  const item = (a: (typeof apps)[number], status: string, confirmed: boolean, basis: string, days: number): ProgressItem => ({ title: a.title, company: a.company.name, logo: a.company.logoUrl, stage: STAGE_LABEL[a.stage], days, status, confirmed, basis, href: appHref(a.id) });
  const moved: ProgressItem[] = [];
  for (const a of apps) for (const s of a.stageHistory) if (s.at >= changeSince && s.to !== "APPLIED") {
    const ev = (eventsBy.get(a.id) ?? []).find((e) => !e.undone && e.newStage === s.to);
    moved.push(item(a, `${s.from ? STAGE_LABEL[s.from] : "New"} → ${STAGE_LABEL[s.to]}`, true, ev ? `Email from ${ev.fromName ?? ev.fromEmail}: “${ev.subject}”` : "You updated it", daysSince(s.at, now)));
  }
  const needsAction = active.filter((a) => (a.nextActionDue && a.nextActionDue <= new Date(now.getTime() + DAY)) || /^(Reply to|Answer the)/.test(a.nextAction ?? ""))
    .map((a) => item(a, a.nextAction ?? "Follow up", true, a.nextActionDue ? `Due ${short(a.nextActionDue)}` : "From your inbox", a.nextActionDue ? daysSince(a.nextActionDue, now) : 0));
  const waiting = active.filter((a) => a.stage === "APPLIED" && a.appliedAt).map((a) => {
    const lastEmail = (eventsBy.get(a.id) ?? [])[0];
    const days = daysSince(a.appliedAt!, now);
    return lastEmail
      ? item(a, `${KIND_LABEL[lastEmail.kind as keyof typeof KIND_LABEL] ?? "Email"} ${short(lastEmail.receivedAt)}, nothing since`, true, `Email: “${lastEmail.subject}”`, days)
      : item(a, "No reply yet", false, mail?.status === "connected" ? `Assumed: no email from ${a.company.name} found in Outlook since you applied` : "Assumed: no reply recorded since you applied", days);
  }).sort((x, y) => y.days - x.days);

  // ---- People to contact
  const people: Person[] = [];
  const contactsAt = await db.contact.findMany({ where: { companyId: { in: [...connections.keys()] } }, include: { company: true } });
  const personFor = (companyId: string, why: (c: (typeof contactsAt)[number]) => string) => contactsAt
    .filter((c) => c.companyId === companyId)
    .sort((x, y) => Number(RECRUITER.test(y.title ?? "") || y.role === "recruiter" || y.role === "hiring_manager") - Number(RECRUITER.test(x.title ?? "") || x.role === "recruiter" || x.role === "hiring_manager") || Number(SALES_LEADER.test(y.title ?? "")) - Number(SALES_LEADER.test(x.title ?? "")))
    .slice(0, 1)
    .map((c) => ({ name: `${c.firstName} ${c.lastName ?? ""}`.trim(), title: c.title, company: c.company?.name ?? c.companyName ?? "", context: c.source === "linkedin_export" ? `1st-degree LinkedIn connection${c.connectedOn ? ` since ${c.connectedOn.getFullYear()}` : ""}` : c.role ? c.role.replace("_", " ") : "Saved contact", reason: why(c), href: c.linkedinUrl ?? `${base}/contacts/${c.id}` }));
  for (const o of opportunities.filter((x) => x.connections && x.fit.action !== "Pass")) people.push(...personFor(picks.find((j) => j.id === o.id)!.companyId, (c) => RECRUITER.test(c.title ?? "") ? `Recruiter there. Ask who owns the ${o.title} search before you apply.` : `Ask for a referral or an intro to the team hiring the ${o.title}.`));
  for (const a of waiting.filter((w) => w.days >= 10).slice(0, 6)) {
    const app = active.find((x) => appHref(x.id) === a.href)!;
    people.push(...personFor(app.companyId, () => `Your ${a.title} application has waited ${a.days} days with no reply. A note from inside can get it read.`));
    if (app.recruiterName && !people.some((p) => p.name === app.recruiterName)) people.push({ name: app.recruiterName, title: "Recruiter", company: a.company, context: "Named on your application", reason: `Ask where the ${a.title} search stands.`, href: a.href });
  }

  // ---- Follow-ups due: who, when, what was said, and a short message
  const fu: FollowUp[] = followUps.slice(0, 8).map((f) => {
    const a = apps.find((x) => x.id === f.id);
    const touch = a?.touches[0];
    const ev = (eventsBy.get(f.id) ?? []).find((e) => e.kind !== "confirmation") ?? (eventsBy.get(f.id) ?? [])[0];
    const last = touch ? { who: `${touch.contact.firstName} ${touch.contact.lastName ?? ""}`.trim(), when: touch.sentAt.toISOString(), channel: touch.channel, about: (touch.message ?? "Your note").slice(0, 140) }
      : ev ? { who: ev.fromName ?? ev.fromEmail, when: ev.receivedAt.toISOString(), channel: "email", about: `${KIND_LABEL[ev.kind as keyof typeof KIND_LABEL] ?? "Email"}: “${ev.subject}”` }
      : null;
    const domain = domainFor(`${f.title} ${a?.job?.descriptionText ?? ""}`);
    const person = touch ? first(touch.contact.firstName) : ev && ev.kind !== "confirmation" && ev.fromName && !/team|talent|recruiting|careers|hr\b/i.test(ev.fromName) ? first(ev.fromName) : null;
    const suggestion = person
      ? `Hi ${person}, following up on your ${short(new Date(last!.when))} note about the ${f.title} role. I'd welcome 20 minutes this week to talk through how my ${domain} work at SAP maps to what the team needs. What works for you?`
      : `Hi [Name], I applied for the ${f.title} role${a?.appliedAt ? ` on ${short(a.appliedAt)}` : ""}. My nine years selling ${domain} at SAP line up closely with the posting. Could you share where the search stands, or point me to the hiring manager?`;
    return { title: f.title, company: f.company.name, due: f.nextActionDue?.toISOString() ?? null, last, suggestion, href: appHref(f.id) };
  });

  // ---- Upcoming interviews
  const iv: Interview[] = interviews.map((a) => {
    const reqLines = (a.job?.requiredQuals ?? "").split("\n").map((l) => l.replace(/^[\s•*\-–]+/, "").trim()).filter((l) => l.length > 15).slice(0, 3);
    const participants = [a.hiringManagerName && `${a.hiringManagerName} (hiring manager)`, a.recruiterName && `${a.recruiterName} (recruiter)`].filter(Boolean) as string[];
    const prep = [!a.preps.some((p) => p.kind === "prep") && "Build a prep sheet", !a.preps.some((p) => p.kind === "mock") && "Run a mock interview", !participants.length && "Add who you're meeting", !a.interviewNotes && "Note what the last conversation covered"].filter(Boolean) as string[];
    return { title: a.title, company: a.company.name, at: a.interviewAt!.toISOString(), participants: participants.length ? participants : ["Not recorded yet"], priorities: reqLines.length ? reqLines : ["Not separated in the posting; read it before the call"], accomplishments: a.job ? bestAccomplishment(a.job, 2) : PROFILE.facts.slice(0, 2), prep, href: appHref(a.id) };
  });

  // ---- Company developments for companies she is pursuing
  const pursuing = new Map<string, string>();
  for (const a of active) pursuing.set(a.companyId, `You applied to ${a.title}`);
  for (const o of picks) if (!pursuing.has(o.companyId)) pursuing.set(o.companyId, `${o.title} is on today's list`);
  const newsOut: News[] = news.filter((n) => n.url && pursuing.has(n.companyId)).slice(0, 8).map((n) => ({ company: n.company.name, headline: n.headline, kind: n.kind, url: n.url!, at: (n.publishedAt ?? n.createdAt).toISOString(), why: pursuing.get(n.companyId)! }));

  // ---- What's working: response rates by role type, resume and channel
  const responded = (a: (typeof apps)[number]) => a.stageHistory.some((s) => (RESPONDED as readonly string[]).includes(s.to)) || (RESPONDED as readonly string[]).includes(a.stage);
  const group = (key: (a: (typeof apps)[number]) => string) => {
    const m = new Map<string, Row>();
    for (const a of apps) { const k = key(a); const r = m.get(k) ?? { label: k, sent: 0, responded: 0 }; r.sent++; if (responded(a)) r.responded++; m.set(k, r); }
    return [...m.values()].sort((x, y) => y.sent - x.sent);
  };
  const byFamily = group((a) => (a.job?.roleFamily ? FAMILY_LABEL[a.job.roleFamily as RoleFamily] ?? a.job.roleFamily : "Other"));
  const byResume = group((a) => a.resume?.name ?? "Not recorded");
  const byChannel = group((a) => (a.touches.some((t) => !a.appliedAt || t.sentAt <= new Date(a.appliedAt.getTime() + 2 * DAY)) ? "Referral or outreach" : "Applied directly"));
  const totalResp = apps.filter(responded).length;
  const patterns: string[] = [];
  const pct = (r: Row) => Math.round((r.responded / r.sent) * 100);
  for (const [name, rows] of [["role type", byFamily], ["resume", byResume], ["channel", byChannel]] as const) {
    const big = rows.filter((r) => r.sent >= 5 && r.label !== "Not recorded" && r.label !== "Other").sort((x, y) => pct(y) - pct(x));
    if (big.length >= 2 && pct(big[0]) - pct(big[big.length - 1]) >= 20) patterns.push(`By ${name}: ${big[0].label} gets replies ${pct(big[0])}% of the time (${big[0].responded} of ${big[0].sent}), ${big[big.length - 1].label} ${pct(big[big.length - 1])}% (${big[big.length - 1].responded} of ${big[big.length - 1].sent}).`);
  }
  const working: Working = { sent: apps.length, responded: totalResp, byFamily, byResume, byChannel, patterns, note: patterns.length ? null : totalResp < 3 ? `Only ${totalResp} response${totalResp === 1 ? "" : "s"} so far: too few to call a pattern.` : "No group of 5+ applications stands out yet." };

  // ---- Urgent updates and the top three
  const urgent: Urgent[] = [];
  for (const m of moved.filter((x) => x.days <= 1)) urgent.push({ tone: /Rejected/.test(m.status) ? "bad" : "good", text: `${m.company}: ${m.status}`, href: m.href });
  for (const c of changes.filter((x) => x.kind === "closed")) urgent.push({ tone: "bad", text: `${c.company} took down ${c.title}`, href: c.href });
  for (const i of iv.filter((x) => new Date(x.at).getTime() - now.getTime() < 2 * DAY)) urgent.push({ tone: "info", text: `${i.company} interview ${new Date(i.at).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Phoenix" })}`, href: i.href });

  const cands: (Priority & { w: number })[] = [];
  for (const i of iv) { const d = (new Date(i.at).getTime() - now.getTime()) / DAY; if (d < 3) cands.push({ kind: "interview", title: `Prepare for ${i.company}`, reason: `Interview ${new Date(i.at).toLocaleString("en-US", { weekday: "long", hour: "numeric", minute: "2-digit", timeZone: "America/Phoenix" })}. Still to do: ${i.prep.slice(0, 2).join(", ").toLowerCase() || "review your notes"}.`, href: i.href, w: 100 - d }); }
  for (const a of active.filter((x) => /^(Reply to|Answer the)/.test(x.nextAction ?? ""))) cands.push({ kind: "reply", title: `${a.nextAction} (${a.company.name})`, reason: `They wrote about ${a.title}; a same-day reply keeps you moving.`, href: appHref(a.id), w: 90 });
  const bestNew = opportunities.find((o) => o.isNew && o.fit.action === "Apply") ?? opportunities.find((o) => o.isNew && o.fit.action === "Seek a referral");
  if (bestNew) cands.push({ kind: bestNew.fit.action === "Seek a referral" ? "referral" : "apply", title: `${bestNew.fit.action === "Seek a referral" ? "Get a referral for" : "Apply to"} ${bestNew.title} at ${bestNew.company}`, reason: bestNew.fit.why[0], href: bestNew.href, w: 80 });
  for (const f of fu.filter((x) => x.due && new Date(x.due) <= now).slice(0, 2)) cands.push({ kind: "followup", title: `Follow up with ${f.company}`, reason: f.last ? `Last contact: ${f.last.who}, ${short(new Date(f.last.when))}.` : `No contact since you applied; due ${short(new Date(f.due!))}.`, href: f.href, w: 70 });
  const oldest = waiting[0];
  if (oldest && oldest.days >= 14) cands.push({ kind: "followup", title: `Nudge ${oldest.company}`, reason: `${oldest.title} has waited ${oldest.days} days with no reply on record.`, href: oldest.href, w: 60 });
  const other = opportunities.find((o) => o !== bestNew && o.fit.action !== "Pass");
  if (other) cands.push({ kind: other.fit.action === "Seek a referral" ? "referral" : "apply", title: `${other.fit.action === "Seek a referral" ? "Get a referral for" : "Look at"} ${other.title} at ${other.company}`, reason: other.fit.why[0], href: other.href, w: 50 });
  const perKind = new Map<string, number>();
  const priorities = cands.sort((a, b) => b.w - a.w).filter((c) => { const n = perKind.get(c.kind) ?? 0; perKind.set(c.kind, n + 1); return n < 2; }).slice(0, 3).map(({ w: _w, ...p }) => p);

  // ---- Stats for the visuals
  const pipeline = (["APPLIED", "RECRUITER_CONTACT", "HIRING_MANAGER", "INTERVIEWING", "FINAL_INTERVIEW", "OFFER"] as const).map((s) => ({ stage: s, label: STAGE_LABEL[s], count: active.filter((a) => a.stage === s).length })).filter((p) => p.count);

  // ---- Original summary fields (kept for the Alerts page)
  const actions = priorities.map((p) => p.title);
  if (lastRun && lastRun.errors > 0) actions.push(`${lastRun.errors} job feeds failed in the last refresh; review Settings`);

  return {
    generatedAt: now.toISOString(),
    lastRun: lastRun ? { at: lastRun.finishedAt?.toISOString() ?? null, status: lastRun.status, created: lastRun.created, closed: lastRun.closed, errors: lastRun.errors } : null,
    newJobs: newJobs.map((j) => ({ id: j.id, title: j.title, company: j.company.name, score: effectiveScore(j), tier: effectiveTier(j), location: j.location, url: j.applyUrl })),
    tier1: tier1.map((j) => ({ id: j.id, title: j.title, company: j.company.name, score: effectiveScore(j), applied: j.applications.some((a) => a.applied), url: `${base}/jobs/${j.id}` })),
    closedJobs: closedJobs.map((j) => ({ id: j.id, title: j.title, company: j.company.name })),
    companyNews: news.slice(0, 15).map((n) => ({ company: n.company.name, headline: n.headline, kind: n.kind, url: n.url })),
    upcomingInterviews: interviews.map((a) => ({ id: a.id, title: a.title, company: a.company.name, at: a.interviewAt!.toISOString() })),
    followUps: followUps.map((a) => ({ id: a.id, title: a.title, company: a.company.name, due: a.nextActionDue?.toISOString() ?? null, action: a.nextAction })),
    actions,
    v2: {
      priorities, opportunities, noStrongMatches: strongNew.length === 0, minScore, urgent: urgent.slice(0, 6), changes,
      progress: { moved, needsAction, waiting }, people: people.slice(0, 8), followUps: fu, interviews: iv, news: newsOut, working,
      stats: { active: active.length, waiting: waiting.length, interviews: iv.length, responseRate: apps.length ? Math.round((totalResp / apps.length) * 100) : null, strongNew: strongNew.length, pipeline },
    },
  };
}

// ------------------------------------------------------------------ email

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const az = (iso: string, o: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleString("en-US", { ...o, timeZone: "America/Phoenix" });
// Purple / magenta palette. Solid colours come first so Outlook desktop, which drops gradients, still shows the brand.
const BRAND = "#5D36FF", MAGENTA = "#A100C2", DEEP = "#2b17a6", INK = "#1a0f4d", MUTED = "#64748b", LINE = "#e4dcff";
const GRAD = (c1: string, c2: string, deg = 120) => `background-color:${c1};background-image:linear-gradient(${deg}deg,${c1} 0%,${c2} 100%)`;
const ACTION_COLOR: Record<string, string> = { Apply: BRAND, "Seek a referral": MAGENTA, "Research further": "#b45309", Pass: "#b91c1c" };

export function briefingHtml(b: BriefingContent, base = "") {
  const v = b.v2;
  if (!v) return `<p>Open the Command Center to see today's briefing.</p>`;
  const stat = (n: string | number, l: string) => `<td style="padding:10px 12px;background-color:#7a52ff;background-color:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.28);border-radius:10px;text-align:center"><div style="font-size:22px;font-weight:700;color:#fff">${n}</div><div style="font-size:11px;color:#f1eaff">${l}</div></td>`;
  const sec = (t: string) => `<div style="margin:18px 0 8px;font-size:16px;font-weight:700;color:${INK};border-left:4px solid ${MAGENTA};padding-left:8px">${titleCase(t)}</div>`;
  const pri = v.priorities.map((p, i) => `<tr><td style="vertical-align:top;padding:6px 10px 6px 0"><div style="width:26px;height:26px;border-radius:13px;background:#ffffff;color:${BRAND};font-weight:700;text-align:center;line-height:26px">${i + 1}</div></td><td style="padding:6px 0"><a href="${p.href}" style="color:#ffffff;font-weight:700;text-decoration:none">${esc(p.title)}</a><div style="color:#e6defe;font-size:13px">${esc(p.reason)}</div></td></tr>`).join("");
  const opp = (o: Opportunity) => `<div style="border:1px solid ${LINE};border-top:4px solid ${BRAND};border-radius:10px;padding:12px 14px;margin-bottom:10px">
    <table width="100%" style="border-collapse:collapse"><tr><td><a href="${o.href}" style="color:${INK};font-weight:700;font-size:15px;text-decoration:none">${esc(o.title)}</a><div style="font-size:13px;color:#334155">${esc(o.company)}${o.pay ? ` · <b style="color:${BRAND}">${esc(o.pay)}</b>` : " · pay not published"} · ${esc(o.location ?? "Location not listed")}${o.remote ? " (remote)" : ""}</div>
    <div style="font-size:12px;color:${MUTED}">${o.postedAt ? `Posted ${az(o.postedAt, { month: "short", day: "numeric" })} · ` : ""}Found ${az(o.firstSeenAt, { month: "short", day: "numeric" })} · Verified ${az(o.verifiedAt, { month: "short", day: "numeric", hour: "numeric" })}${o.isNew ? "" : " · still open"}</div></td>
    <td style="text-align:right;vertical-align:top;white-space:nowrap"><span style="display:inline-block;padding:3px 9px;border-radius:12px;background:${ACTION_COLOR[o.fit.action]};color:#fff;font-size:12px;font-weight:700">${o.fit.action}</span><div style="margin-top:6px;font-size:12px"><a href="${esc(o.applyUrl)}" style="color:${MAGENTA};font-weight:600">Apply link</a></div></td></tr></table>
    <div style="font-size:13px;margin-top:6px"><b style="color:${BRAND}">Why It Fits:</b> ${o.fit.why.map(esc).join(" ")}</div>
    <div style="font-size:13px"><b style="color:#b91c1c">Could Block You:</b> ${esc(o.fit.blocker)}</div>
    <div style="font-size:13px"><b style="color:${MAGENTA}">Lead With:</b> ${esc(o.fit.position)}</div>
    <div style="font-size:13px"><b style="color:${INK}">Today:</b> ${esc(o.fit.action)}. ${esc(o.fit.reason)}</div></div>`;
  const tone = { good: "#047857", bad: "#b91c1c", info: BRAND };
  const urgent = v.urgent.length ? v.urgent.map((u) => `<div style="font-size:13px;padding:3px 0"><span style="color:${tone[u.tone]}">●</span> <a href="${u.href}" style="color:#0f172a;text-decoration:none">${esc(u.text)}</a></div>`).join("") : `<div style="color:${MUTED};font-size:13px">Nothing urgent.</div>`;
  const more: [string, number][] = [["Changes to tracked jobs", v.changes.length], ["Application progress", v.progress.moved.length + v.progress.needsAction.length], ["Waiting on a reply", v.progress.waiting.length], ["People to contact", v.people.length], ["Follow-ups due", v.followUps.length], ["Upcoming interviews", v.interviews.length], ["Company developments", v.news.length]];
  return `<div style="font-family:Inter,Segoe UI,Arial,sans-serif;max-width:680px;color:#0f172a">
  <div style="${GRAD(BRAND, MAGENTA)};padding:18px 20px;border-radius:12px 12px 0 0"><div style="color:#ffffff;font-size:20px;font-weight:700">Daily Briefing</div><div style="color:#f1eaff;font-size:13px;font-weight:600">${az(b.generatedAt, { weekday: "long", month: "long", day: "numeric" })}</div>
  <table style="margin-top:12px;border-collapse:separate;border-spacing:6px 0"><tr>${stat(v.stats.active, "Active")}${stat(v.stats.waiting, "Waiting")}${stat(v.stats.interviews, "Interviews")}${stat(v.stats.responseRate == null ? "—" : `${v.stats.responseRate}%`, "Reply Rate")}${stat(v.stats.strongNew, "Strong New")}</tr></table></div>
  <div style="padding:6px 20px 18px;border:1px solid ${LINE};border-top:0;border-radius:0 0 12px 12px">
  <div style="${GRAD(DEEP, "#7a14d0", 155)};border-radius:12px;padding:12px 16px;margin-top:14px"><div style="color:#ffffff;font-size:16px;font-weight:700;margin-bottom:4px">Today's Top Three</div><table style="border-collapse:collapse">${pri || `<tr><td style="color:#e6defe">Nothing pressing today.</td></tr>`}</table></div>
  ${sec(v.noStrongMatches ? "Opportunities · no strong new matches today" : "Best new opportunities")}
  ${v.noStrongMatches ? `<div style="font-size:13px;color:${MUTED};margin-bottom:8px">No new role scored ${v.minScore}+ since yesterday.${v.opportunities.length ? " Best ones still open:" : ""}</div>` : ""}${v.opportunities.map(opp).join("")}
  ${sec("Urgent updates")}${urgent}
  ${sec("More in the app")}<table style="font-size:13px;border-collapse:collapse">${more.map(([l, n]) => `<tr><td style="padding:2px 16px 2px 0">${l}</td><td style="font-weight:700">${n}</td></tr>`).join("")}</table>
  <p style="margin-top:14px"><a href="${base}/briefing" style="display:inline-block;${GRAD(BRAND, MAGENTA, 90)};color:#fff;padding:9px 16px;border-radius:8px;text-decoration:none;font-weight:600">Open the full briefing</a></p>
  <p style="font-size:11px;color:${MUTED}">Listings verified ${b.lastRun?.at ? az(b.lastRun.at, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—"} (Arizona). Fit notes are ${v.opportunities.some((o) => o.fit.source === "ai") ? "AI-written from your resume" : "rule-based from your resume"}; check them against the posting.</p>
  </div></div>`;
}

export async function generateAndSendBriefing(db: PrismaClient, opts: { allowDelegate?: boolean } = { allowDelegate: true }) {
  const content = await buildBriefing(db, new Date(), opts);
  const lastRun = await db.ingestionRun.findFirst({ orderBy: { startedAt: "desc" } });
  const { to } = await alertAddress(db);
  let emailStatus = "not_sent";
  if (to) {
    const v = content.v2!;
    const subject = `Briefing: ${v.priorities.length} priorit${v.priorities.length === 1 ? "y" : "ies"} · ${v.noStrongMatches ? "no strong new matches" : `${v.stats.strongNew} strong new match${v.stats.strongNew === 1 ? "" : "es"}`}`;
    const r = await deliver(db, to, subject, briefingHtml(content, await appBase(db)));
    emailStatus = r.detail;
  }
  // Roles in the briefing have been seen, so the hourly alerts don't send them again.
  if (content.newJobs.length) await db.job.updateMany({ where: { id: { in: content.newJobs.map((j) => j.id) }, alertedAt: null }, data: { alertedAt: new Date() } });
  return db.briefing.create({ data: { content, basedOnRun: lastRun?.id, emailedTo: to, emailStatus } });
}

export { ACTIVE_STAGES };
