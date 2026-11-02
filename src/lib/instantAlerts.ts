// Instant alerts: after each hourly feed refresh, email her any newly found role that scores at or above
// her alert threshold, so a strong fit reaches her within the hour instead of at the next morning briefing.
import type { PrismaClient } from "@prisma/client";
import { companyCap } from "./companyCap";
import { FEED_CATEGORIES, NOT_APPLIED } from "./queries";
import { postedWithin } from "./jobFilters";
import { effectiveScore, type Reason } from "./scoring";
import { alertAddress, deliver } from "./notify";
import type { Fetch } from "./mail/outlook";
import { appBase } from "./appUrl";
import { executive } from "./briefingFit";

const HOUR = 3600_000;
/** Only roles found recently: a role that waited longer than this is in the morning briefing instead. */
const WINDOW_HOURS = 30;
/** "New" means newly posted: a role posted weeks ago that the app only just found (a new board, a new source) is not news. */
export const NEW_POSTING_DAYS = 3;

export async function instantAlertJobs(db: PrismaClient, minScore: number, now = new Date()) {
  const cap = await companyCap(db);
  const jobs = await db.job.findMany({
    where: { id: { in: cap.ids }, alertedAt: null, status: "OPEN", dismissed: false, category: { in: FEED_CATEGORIES }, firstSeenAt: { gte: new Date(now.getTime() - WINDOW_HOURS * HOUR) }, ...NOT_APPLIED, AND: [postedWithin(NEW_POSTING_DAYS, now)] },
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
    const pay = money(j.oteMax ?? j.oteMin) ? `${money(j.oteMax ?? j.oteMin)} OTE` : money(j.salaryMax ?? j.salaryMin) ? `${money(j.salaryMax ?? j.salaryMin)} base` : null;
    const why = ((j.scoreReasons as Reason[] | null) ?? []).filter((r) => r.delta === "+").slice(0, 3).map((r) => `<li style="margin:0 0 2px">${esc(executive(r.text))}</li>`).join("");
    const link = `${base}/jobs/${j.id}`;
    return `<div style="border:1px solid #e4dcff;border-top:4px solid #5D36FF;border-radius:10px;padding:12px 14px;margin:0 0 12px">
      <table width="100%" style="border-collapse:collapse"><tr>
        <td style="vertical-align:top"><a href="${link}" style="color:#1a0f4d;font-size:16px;font-weight:700;text-decoration:none">${esc(j.title)}</a>
          <div style="color:#334155;font-size:14px;margin-top:2px">${esc(j.company.name)}${pay ? ` · <b style="color:#5D36FF">${pay}</b>` : ""}${j.location ? ` · ${esc(j.location)}` : ""}</div></td>
        <td style="vertical-align:top;text-align:right;width:56px"><span style="display:inline-block;min-width:34px;padding:6px 0;border-radius:17px;background-color:#5D36FF;background-image:linear-gradient(135deg,#5D36FF,#A100C2);color:#fff;font-weight:700;font-size:13px;text-align:center">${effectiveScore(j)}</span></td>
      </tr></table>
      ${why ? `<ul style="margin:8px 0 0 18px;padding:0;font-size:14px;color:#334155">${why}</ul>` : ""}
      <div style="margin-top:12px"><a href="${link}" style="display:inline-block;background-color:#5D36FF;background-image:linear-gradient(90deg,#5D36FF,#A100C2);color:#fff;padding:7px 14px;border-radius:8px;text-decoration:none;font-weight:600;font-size:13px">Open in Command Center</a>
        <a href="${esc(j.applyUrl)}" style="margin-left:12px;color:#A100C2;font-weight:600;font-size:13px">Employer posting</a></div>
    </div>`;
  }).join("");
  const html = `<div style="font-family:Inter,Segoe UI,Arial,sans-serif;max-width:640px;color:#0f172a">
  <div style="background-color:#5D36FF;background-image:linear-gradient(120deg,#5D36FF,#A100C2);padding:16px 20px;border-radius:12px 12px 0 0"><div style="color:#fff;font-size:19px;font-weight:700">New High-Fit Role${jobs.length > 1 ? "s" : ""}</div><div style="color:#f1eaff;font-size:13px;font-weight:600">${jobs.length} found in the last hour on employer job boards</div></div>
  <div style="padding:14px 20px 8px;border:1px solid #e4dcff;border-top:0;border-radius:0 0 12px 12px">${rows}
  <p style="color:#64748b;font-size:12px;margin:4px 0 8px">Sent for new roles at or above your alert threshold. Adjust it, or turn instant alerts off, in Settings.</p></div></div>`;
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
  const base = await appBase(db);
  const { subject, html } = alertEmail(jobs, base);
  const r = await deliver(db, to, subject, html, opts.fetch);
  // A failure is retried next hour; with nothing set up to send email, the in-app alert is all there is.
  if (r.ok || r.via === null) await db.job.updateMany({ where: { id: { in: jobs.map((j) => j.id) } }, data: { alertedAt: now } });
  return { sent: r.ok ? jobs.length : 0, detail: r.detail };
}
