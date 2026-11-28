// Shared metric definitions (redesign, Nov 28). Every screen that shows one of these numbers reads it from here, under
// this label, so the same word never means two different counts. See the audit: "Active" used to be 9 on the
// Command Center (recruiter to final stages) and 27 on the Briefing (Applied to Offer).
import type { Prisma, PrismaClient } from "@prisma/client";
import { ACTIVE_PROCESS, CLOSED_STAGES, followUpWhere, READY_TO_APPLY } from "./queries";

const DAY = 86400_000;

/** Stages that count as a live application she has sent: Applied through Offer. */
export const ACTIVE_APPLICATION_STAGES = ["APPLIED", "RECRUITER_CONTACT", "HIRING_MANAGER", "INTERVIEWING", "FINAL_INTERVIEW", "OFFER"] as const;
/** A response: the application reached a recruiter, the hiring manager, an interview or an offer, now or at any point. */
export const RESPONDED_STAGES = ["RECRUITER_CONTACT", "HIRING_MANAGER", "INTERVIEWING", "FINAL_INTERVIEW", "OFFER", "ACCEPTED"] as const;
export const INTERVIEW_WINDOW_DAYS = 7;

/** Label, what kind of number it is, and the plain-language rule shown on hover. */
export const METRICS = {
  submitted: { label: "Total Applications Submitted", kind: "cumulative", rule: "Every application you marked applied, all-time, including closed ones." },
  active: { label: "Active Applications", kind: "current", rule: "Applications you sent that are still open: Applied through Offer." },
  interviewProcesses: { label: "Active Interview Processes", kind: "current", rule: "Open applications at Recruiter Contact, Hiring Manager, Interviewing or Final Interview." },
  interviewsSoon: { label: "Interviews, Next 7 Days", kind: "time-bound", rule: "Interviews on the calendar between now and 7 days from now." },
  awaiting: { label: "Applications Awaiting Response", kind: "current", rule: "Applications still at Applied: no recruiter or hiring manager reply recorded yet." },
  followUps: { label: "Follow-Ups Due", kind: "current", rule: "Open applications whose next step is due now, or that have had no reply and no activity for 7 days after you applied." },
  responseRate: { label: "Response Rate", kind: "cumulative", rule: "Share of submitted applications that ever reached a recruiter, the hiring manager, an interview or an offer." },
  readyToApply: { label: "Ready to Apply", kind: "current", rule: "Roles you saved and have not sent yet, while the posting is open." },
  offers: { label: "Offers", kind: "cumulative", rule: "Applications that reached Offer, now or before." },
} as const;
export type MetricKey = keyof typeof METRICS;

export const metricWhere = {
  submitted: (): Prisma.ApplicationWhereInput => ({ applied: true }),
  active: (): Prisma.ApplicationWhereInput => ({ applied: true, stage: { in: [...ACTIVE_APPLICATION_STAGES] } }),
  interviewProcesses: (): Prisma.ApplicationWhereInput => ({ stage: { in: [...ACTIVE_PROCESS] } }),
  interviewsSoon: (now = new Date()): Prisma.ApplicationWhereInput => ({ interviewAt: { gte: now, lte: new Date(now.getTime() + INTERVIEW_WINDOW_DAYS * DAY) }, stage: { notIn: [...CLOSED_STAGES] } }),
  awaiting: (): Prisma.ApplicationWhereInput => ({ applied: true, stage: "APPLIED" }),
  followUps: (now = new Date()): Prisma.ApplicationWhereInput => followUpWhere(now),
  responded: (): Prisma.ApplicationWhereInput => ({ applied: true, OR: [{ stage: { in: [...RESPONDED_STAGES] } }, { stageHistory: { some: { to: { in: [...RESPONDED_STAGES] } } } }] }),
  readyToApply: (): Prisma.ApplicationWhereInput => READY_TO_APPLY,
  offers: (): Prisma.ApplicationWhereInput => ({ OR: [{ stage: { in: ["OFFER", "ACCEPTED"] } }, { stageHistory: { some: { to: "OFFER" } } }] }),
};

/** Query-string filters for the Applications table that show exactly the records behind each number. */
export const METRIC_FILTER: Record<MetricKey, string> = {
  submitted: "applied=1", active: "open=1", interviewProcesses: "active=1", interviewsSoon: "interviews=7", awaiting: "stage=APPLIED",
  followUps: "followup=1", responseRate: "applied=1", readyToApply: "", offers: "stage=OFFER",
};

export type CoreMetrics = Record<Exclude<MetricKey, "responseRate">, number> & { responseRate: number | null; responded: number };

/** All headline application numbers in one round trip, each from its shared definition. */
export async function coreMetrics(db: PrismaClient, now = new Date()): Promise<CoreMetrics> {
  const [submitted, active, interviewProcesses, interviewsSoon, awaiting, followUps, responded, readyToApply, offers] = await Promise.all([
    db.application.count({ where: metricWhere.submitted() }),
    db.application.count({ where: metricWhere.active() }),
    db.application.count({ where: metricWhere.interviewProcesses() }),
    db.application.count({ where: metricWhere.interviewsSoon(now) }),
    db.application.count({ where: metricWhere.awaiting() }),
    db.application.count({ where: metricWhere.followUps(now) }),
    db.application.count({ where: metricWhere.responded() }),
    db.application.count({ where: metricWhere.readyToApply() }),
    db.application.count({ where: metricWhere.offers() }),
  ]);
  return { submitted, active, interviewProcesses, interviewsSoon, awaiting, followUps, responded, readyToApply, offers, responseRate: submitted ? Math.round((responded / submitted) * 100) : null };
}

/** "8 of 13" when a list shows fewer than the total, so a shortened list never reads as the count. */
export const ofTotal = (shown: number, total: number) => (shown < total ? `${shown} of ${total}` : `${total}`);
