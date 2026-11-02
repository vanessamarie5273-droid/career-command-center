// Instant alerts: after each hourly feed refresh, email her any newly found role that scores at or above
// her alert threshold, so a strong fit reaches her within the hour instead of at the next morning briefing.
import type { PrismaClient } from "@prisma/client";
import { companyCap } from "./companyCap";
import { FEED_CATEGORIES, NOT_APPLIED } from "./queries";
import { effectiveScore, type Reason } from "./scoring";
import { alertAddress, deliver } from "./notify";
import type { Fetch } from "./mail/outlook";

const HOUR = 3600_000;
/** Only roles found recently: a role that waited longer than this is in the morning briefing instead. */
const WINDOW_HOURS = 30;

export async function instantAlertJobs(db: PrismaClient, minScore: number, now = new Date()) {
  const cap = await companyCap(db);
  const jobs = await db.job.findMany({
    where: { id: { in: cap.ids }, alertedAt: null, status: "OPEN", dismissed: false, category: { in: FEED_CATEGORIES }, firstSeenAt: { gte: new Date(now.getTime() - WINDOW_HOURS * HOUR) }, ...NOT_APPLIED },
    include: { company: true }, orderBy: { score: "desc" },
  });
  return jobs.filter((j) => (effectiveScore(j) ?? 0) >= minScore);
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const money = (n: number | null) => (n ? `$${Math.round(n / 1000)}K` : null);

type AlertJob = Awaited<ReturnType<typeof instantAlertJobs>>[number];
export function alertEmail(jobs: AlertJob[], base: string) {
  const top = jobs[0];
  const subject = jobs.length === 1 ? `New ${effectiveScore(top)}-point match: ${top.title} at ${top.company.name}` : `${jobs.length} new high-fit roles: ${jobs.slice(0, 3).map((j) => j.company.name).join(", ")}${jobs.length > 3 ? "…" : ""}`;
  const rows = jobs.map((j) => {
    const pay = money(j.oteMax ?? j.oteMin) ? `OTE ${money(j.oteMax ?? j.oteMin)}` : money(j.salaryMax ?? j.salaryMin) ? `base ${money(j.salaryMax ?? j.salaryMin)}` : null;
    const why = ((j.scoreReasons as Reason[] | null) ?? []).filter((r) => r.delta === "+").slice(0, 3).map((r) => `<li>${esc(r.text)}</li>`).join("");
    return `<div style="border:1px solid #e2e8f0;border-radius:8px;padding:12px 14px;margin:0 0 12px">
      <div style="font-size:16px;font-weight:600"><a href="${base}/jobs/${j.id}" style="color:#2b17a6">${esc(j.title)}</a></div>
      <div style="color:#475569;font-size:13px;margin-top:2px">${esc(j.company.name)} · <b>${effectiveScore(j)} pts</b>${j.location ? ` · ${esc(j.location)}` : ""}${pay ? ` · ${pay} (published)` : ""}</div>
      ${why ? `<ul style="margin:8px 0 0 18px;padding:0;font-size:13px;color:#334155">${why}</ul>` : ""}
      <div style="margin-top:10px;font-size:13px"><a href="${base}/jobs/${j.id}" style="color:#A100C2;font-weight:600">Open in Command Center</a> · <a href="${esc(j.applyUrl)}" style="color:#475569">Employer posting</a></div>
    </div>`;
  }).join("");
  const html = `<div style="font-family:Inter,Arial,sans-serif;max-width:640px;color:#0f172a">
  <div style="background:#2b17a6;color:#ffffff;padding:14px 20px;font-size:17px;font-weight:600">Career Command Center · New high-fit role${jobs.length > 1 ? "s" : ""}</div>
  <div style="padding:16px 20px"><p style="margin:0 0 12px;color:#475569;font-size:13px">Found in the last hour on the employer's own job board. Early applicants get read first: save it to Ready to Apply and build the kit today.</p>${rows}
  <p style="color:#94a3b8;font-size:12px">You get these for new roles scoring at least your alert threshold. Change it, or turn instant alerts off, in Settings.</p></div></div>`;
  return { subject, html };
}

/** Email the new high-fit roles, once each. Returns how many were sent. */
export async function sendInstantAlerts(db: PrismaClient, opts: { now?: Date; fetch?: Fetch } = {}) {
  const now = opts.now ?? new Date();
  const { user, to } = await alertAddress(db);
  if (!user?.instantAlerts) return { sent: 0, detail: "instant alerts are off" };
  const jobs = await instantAlertJobs(db, user.alertMinScore, now);
  if (!jobs.length) return { sent: 0, detail: "no new high-fit roles" };
  if (!to) return { sent: 0, detail: "no alert address" };
  const base = process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || "";
  const { subject, html } = alertEmail(jobs, base);
  const r = await deliver(db, to, subject, html, opts.fetch);
  // A failure is retried next hour; with nothing set up to send email, the in-app alert is all there is.
  if (r.ok || r.via === null) await db.job.updateMany({ where: { id: { in: jobs.map((j) => j.id) } }, data: { alertedAt: now } });
  return { sent: r.ok ? jobs.length : 0, detail: r.detail };
}
