// The Command Center dashboard: her applications only (jobs live in Discover Jobs), plus application search.
import type { Prisma, PrismaClient } from "@prisma/client";
import { ACTIVE_PROCESS, CLOSED_STAGES, followUpWhere, READY_TO_APPLY, startOfTodayPhoenix } from "./queries";

export { SEARCH_BY, type SearchBy } from "./searchBy";

const PAST_APPLIED = ["RECRUITER_CONTACT", "HIRING_MANAGER", "INTERVIEWING", "FINAL_INTERVIEW", "OFFER", "ACCEPTED"] as const;
const OPEN: Prisma.ApplicationWhereInput = { stage: { notIn: [...CLOSED_STAGES, "ON_HOLD"] } };
export const QUIET_DAYS = 14;

/** Where clause for one search; null when there is nothing valid to search for. Dates are days in Arizona time, like the rest of the app. */
export function applicationSearch(by: string | undefined, q: string | undefined): Prisma.ApplicationWhereInput | null {
  const text = q?.trim();
  if (!text) return null;
  if (by === "date") {
    const m = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const start = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]) + 7 * 3600_000); // Arizona is UTC-7 year-round
    return { appliedAt: { gte: start, lt: new Date(start.getTime() + 86400_000) } };
  }
  if (by === "position") return { title: { contains: text, mode: "insensitive" } };
  return { company: { name: { contains: text, mode: "insensitive" } } };
}

export async function pipelineDashboard(db: PrismaClient, now = new Date()) {
  const quietSince = new Date(now.getTime() - QUIET_DAYS * 86400_000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 86400_000);
  const [stages, applied, movedOn, active, interviews, offers, followUps, ready, dueTasks, upcoming, quiet, moves] = await Promise.all([
    db.application.groupBy({ by: ["stage"], _count: true }),
    db.application.count({ where: { applied: true } }),
    db.application.count({ where: { applied: true, OR: [{ stage: { in: [...PAST_APPLIED] } }, { stageHistory: { some: { to: { in: [...PAST_APPLIED] } } } }] } }),
    db.application.count({ where: { stage: { in: [...ACTIVE_PROCESS] } } }),
    db.application.count({ where: { interviewAt: { gte: now } } }),
    db.application.count({ where: { OR: [{ stage: { in: ["OFFER", "ACCEPTED"] } }, { stageHistory: { some: { to: "OFFER" } } }] } }),
    db.application.findMany({ where: followUpWhere(now), include: { company: { select: { name: true, logoUrl: true } } }, orderBy: [{ nextActionDue: "asc" }, { appliedAt: "asc" }], take: 40 }),
    db.application.count({ where: READY_TO_APPLY }),
    db.task.findMany({ where: { done: false, dueAt: { lte: new Date(now.getTime() + 7 * 86400_000) } }, include: { application: { include: { company: { select: { name: true, logoUrl: true } } } } }, orderBy: { dueAt: "asc" }, take: 30 }),
    db.application.findMany({ where: { interviewAt: { gte: now } }, include: { company: { select: { name: true, logoUrl: true } } }, orderBy: { interviewAt: "asc" }, take: 8 }),
    db.application.findMany({ where: { AND: [OPEN, { applied: true }, { updatedAt: { lt: quietSince } }] }, include: { company: { select: { name: true, logoUrl: true } } }, orderBy: { updatedAt: "asc" }, take: 6 }),
    db.stageChange.findMany({ where: { at: { gte: twoWeeksAgo } }, include: { application: { include: { company: { select: { name: true, logoUrl: true } } } } }, orderBy: { at: "desc" }, take: 30 }),
  ]);
  const board = await db.application.findMany({ where: { stage: { notIn: ["ON_HOLD"] } }, select: { id: true, stage: true, company: { select: { name: true, logoUrl: true } } }, orderBy: { updatedAt: "desc" } });
  const weeks: { week: string; applied: number; moves: number }[] = [];
  const start = new Date(now.getTime() - 11 * 7 * 86400_000);
  const [appliedRows, moveRows] = await Promise.all([
    db.application.findMany({ where: { appliedAt: { gte: start } }, select: { appliedAt: true } }),
    db.stageChange.findMany({ where: { at: { gte: start } }, select: { at: true } }),
  ]);
  for (let i = 0; i < 12; i++) {
    const ws = new Date(start.getTime() + i * 7 * 86400_000), we = new Date(ws.getTime() + 7 * 86400_000);
    weeks.push({ week: ws.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Phoenix" }), applied: appliedRows.filter((a) => a.appliedAt! >= ws && a.appliedAt! < we).length, moves: moveRows.filter((m) => m.at >= ws && m.at < we).length });
  }
  return {
    stages: stages.map((s) => ({ stage: s.stage, count: s._count })),
    tiles: { active, applied, responseRate: applied ? Math.round((movedOn / applied) * 100) : null, interviews, offers, followUps: await db.application.count({ where: followUpWhere(now) }), readyToApply: ready },
    followUps, dueTasks, upcoming, quiet, moves, weeks,
    funnel: funnel(board),
  };
}

type Co = { name: string; logoUrl: string | null };

// The stages an open application moves through, left to right. Pre-apply stages fold into Ready to Apply.
export const FUNNEL = [
  ["READY_TO_APPLY", "Ready to apply"], ["APPLIED", "Applied"], ["RECRUITER_CONTACT", "Recruiter"], ["HIRING_MANAGER", "Hiring manager"],
  ["INTERVIEWING", "Interviewing"], ["FINAL_INTERVIEW", "Final round"], ["OFFER", "Offer"],
] as const;
const PRE = new Set(["RESEARCHING", "PRIORITIZED", "RESUME_PREP", "READY_TO_APPLY"]);

/** Count and a few company logos for each funnel stage, plus the closed ones. */
export function funnel(apps: { stage: string; company: Co }[]) {
  const stages = FUNNEL.map(([key, label]) => {
    const here = apps.filter((a) => (key === "READY_TO_APPLY" ? PRE.has(a.stage) : a.stage === key));
    const seen = new Set<string>();
    const logos = here.map((a) => a.company).filter((c) => !seen.has(c.name) && seen.add(c.name)).slice(0, 4);
    return { key, label, count: here.length, logos };
  });
  const closed = (["ACCEPTED", "REJECTED", "WITHDRAWN"] as const).map((k) => ({ key: k, count: apps.filter((a) => a.stage === k).length }));
  return { stages, closed };
}

export type AgendaItem = {
  id: string; kind: "interview" | "task" | "followup"; appId: string | null; company: Co | null; role: string | null;
  text: string; due: Date | null; bucket: "overdue" | "today" | "soon";
};

/** Hide automated sender addresses in next-action text: "Reply to no-reply@x.io with…" reads "Reply to the recruiter with…". */
export const tidyAction = (s: string) => s.replace(/\b(?:no-?reply|donotreply|do-not-reply)@[\w.-]+/gi, "the recruiter");

/**
 * One to-do list for the dashboard: interviews, tasks and follow-ups with a set date, sorted by when they are due
 * and bucketed into overdue / today / this week. Follow-ups that only exist because an application went 7 days
 * without a reply come back separately as `nudges`, so a long list of identical "follow up" rows stays one line.
 */
export function agenda(
  d: { followUps: { id: string; title: string; nextAction: string | null; nextActionDue: Date | null; appliedAt: Date | null; company: Co }[];
    dueTasks: { id: string; title: string; dueAt: Date | null; application: { id: string; title: string; company: Co } | null }[];
    upcoming: { id: string; title: string; interviewAt: Date | null; company: Co }[] },
  now = new Date(),
) {
  const today = startOfTodayPhoenix(now), tomorrow = new Date(today.getTime() + 86400_000);
  const bucket = (due: Date | null): AgendaItem["bucket"] => (!due || due < today ? "overdue" : due < tomorrow ? "today" : "soon");
  const items: AgendaItem[] = [
    ...d.upcoming.map((a) => ({ id: `i-${a.id}`, kind: "interview" as const, appId: a.id, company: a.company, role: a.title, text: "Interview", due: a.interviewAt })),
    ...d.dueTasks.map((t) => ({ id: `t-${t.id}`, kind: "task" as const, appId: t.application?.id ?? null, company: t.application?.company ?? null, role: t.application?.title ?? null, text: tidyAction(t.title), due: t.dueAt })),
    ...d.followUps.filter((a) => a.nextActionDue).map((a) => ({ id: `f-${a.id}`, kind: "followup" as const, appId: a.id, company: a.company, role: a.title, text: tidyAction(a.nextAction || "Follow up"), due: a.nextActionDue })),
  ].map((x) => ({ ...x, bucket: x.kind === "interview" && x.due && x.due >= tomorrow ? "soon" as const : bucket(x.due) }));
  const rank = { overdue: 0, today: 1, soon: 2 };
  items.sort((a, b) => rank[a.bucket] - rank[b.bucket] || (a.due?.getTime() ?? 0) - (b.due?.getTime() ?? 0));
  const nudges = d.followUps.filter((a) => !a.nextActionDue).map((a) => ({ id: a.id, company: a.company, role: a.title, appliedAt: a.appliedAt }));
  return { items, nudges };
}

export type FeedItem = {
  id: string; at: Date; appId: string; company: Co | null; role: string | null;
  from: string | null; to: string | null; via: string; emailId: string | null; undoable: boolean;
};

/**
 * What changed in the last two weeks, newest first. A stage move that came from an email shows once, with the
 * email as its source and an Undo. Emails that changed nothing come back as `logged`, to be tucked away.
 */
export function feed(
  emails: { id: string; applicationId: string | null; kind: string; fromName: string | null; fromEmail: string; subject: string; receivedAt: Date; prevStage: string | null; newStage: string | null; undone: boolean }[],
  moves: { id: string; applicationId: string; from: string | null; to: string; at: Date; application: { title: string; company: Co } }[],
  apps: { id: string; title: string; company: Co }[],
  kindLabel: Record<string, string>,
) {
  const app = (id: string | null) => apps.find((a) => a.id === id) ?? moves.find((m) => m.applicationId === id)?.application ?? null;
  const items: FeedItem[] = [];
  const used = new Set<string>();
  for (const e of emails) {
    if (!e.applicationId || !e.newStage || e.undone) continue;
    const m = moves.find((x) => !used.has(x.id) && x.applicationId === e.applicationId && x.to === e.newStage);
    if (m) used.add(m.id);
    const a = app(e.applicationId);
    items.push({ id: `e-${e.id}`, at: e.receivedAt, appId: e.applicationId, company: a?.company ?? null, role: a?.title ?? null, from: e.prevStage ?? m?.from ?? null, to: e.newStage, via: `${kindLabel[e.kind] ?? e.kind} email`, emailId: e.id, undoable: true });
  }
  for (const m of moves) {
    if (used.has(m.id)) continue;
    items.push({ id: `m-${m.id}`, at: m.at, appId: m.applicationId, company: m.application.company, role: m.application.title, from: m.from, to: m.to, via: "Updated by you", emailId: null, undoable: false });
  }
  items.sort((a, b) => b.at.getTime() - a.at.getTime());
  const logged = emails.filter((e) => !e.newStage || e.undone).map((e) => {
    const a = app(e.applicationId);
    return { id: e.id, at: e.receivedAt, appId: e.applicationId, company: a?.company ?? null, label: kindLabel[e.kind] ?? e.kind, from: e.fromName ?? e.fromEmail, subject: e.subject, undone: e.undone };
  });
  return { items, logged };
}
