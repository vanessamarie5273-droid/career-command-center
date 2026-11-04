// Instant alerts: after each hourly feed refresh, email her any newly found role that scores at or above
// her alert threshold, so a strong fit reaches her within the hour instead of at the next morning briefing.
import type { PrismaClient } from "@prisma/client";
import { companyCap } from "./companyCap";
import { NOT_APPLIED } from "./queries";
import { postedWithin } from "./jobFilters";
import { effectiveScore } from "./scoring";
import { parseLocation } from "./normalize";
import { alertAddress, deliver } from "./notify";
import type { Fetch } from "./mail/outlook";
import { appBase } from "./appUrl";
import { bestAccomplishment, ensureFitBriefs, type FitBrief } from "./briefingFit";

const HOUR = 3600_000;
/** Only roles found recently: a role that waited longer than this is in the morning briefing instead. */
const WINDOW_HOURS = 30;
/** "New" means newly posted: a role posted weeks ago that the app only just found (a new board, a new source) is not news. */
export const NEW_POSTING_DAYS = 3;
/** Relocation roles stay in Discover Jobs, but never interrupt her with an alert. */
const ALERT_CATEGORIES = ["MAIN", "STRETCH"];

type LocatedJob = { location: string | null; isRemote: boolean; workArrangement: string | null };

/**
 * Whether a role fits where she lives: based in the Phoenix area, or remote anywhere in the U.S. (or remote
 * with Arizona among the listed states). A "remote" role listed only for Seattle or San Francisco is tied to
 * that city, and East Coast ties are already screened out by scoring.
 */
export function homeOrRemote(j: LocatedJob) {
  const loc = parseLocation(j.location, { remoteFlag: j.isRemote, workplaceType: j.workArrangement });
  if (loc.azMetro) return true;
  return loc.isRemote && loc.isUS && (loc.states.length === 0 || loc.states.includes("AZ"));
}

/** Where the role is, in plain words: "Phoenix, AZ" or "Remote (U.S.)". */
export function placeLabel(j: LocatedJob) {
  const loc = parseLocation(j.location, { remoteFlag: j.isRemote, workplaceType: j.workArrangement });
  const short = (j.location ?? "").replace(/,?\s*(United States( of America)?|USA|US)\s*$/i, "").replace(/\bArizona\b/, "AZ").trim();
  if (loc.azMetro) return loc.isRemote ? "Remote or Phoenix area" : `${short || "Phoenix area"}${loc.arrangement === "Hybrid" ? " (hybrid)" : ""}`;
  return "Remote (U.S.)";
}

export async function instantAlertJobs(db: PrismaClient, minScore: number, now = new Date()) {
  const cap = await companyCap(db);
  const jobs = await db.job.findMany({
    where: { id: { in: cap.ids }, alertedAt: null, status: "OPEN", dismissed: false, category: { in: ALERT_CATEGORIES }, firstSeenAt: { gte: new Date(now.getTime() - WINDOW_HOURS * HOUR) }, ...NOT_APPLIED, AND: [postedWithin(NEW_POSTING_DAYS, now)] },
    include: { company: true }, orderBy: { score: "desc" },
  });
  return jobs.filter((j) => (effectiveScore(j) ?? 0) >= minScore && homeOrRemote(j));
}

type AlertJob = Awaited<ReturnType<typeof instantAlertJobs>>[number];
/** One posting the company lists under several cities, shown once. `jobs[0]` is the highest-scoring listing. */
export type AlertRole = { jobs: AlertJob[]; why: string };

const titleKey = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** The same title at the same company is one role, however many city listings it has. */
export function groupRoles(jobs: AlertJob[], why: (j: AlertJob) => string = defaultWhy): AlertRole[] {
  const groups = new Map<string, AlertJob[]>();
  for (const j of [...jobs].sort((a, b) => (effectiveScore(b) ?? 0) - (effectiveScore(a) ?? 0))) {
    const k = `${j.companyId}|${titleKey(j.title)}`;
    groups.set(k, [...(groups.get(k) ?? []), j]);
  }
  return [...groups.values()].map((g) => ({ jobs: g, why: why(g[0]) }));
}

/** A single sentence on why she fits: Claude's assessment from her resume when there is one, else the resume fact closest to the posting. */
function defaultWhy(j: AlertJob) {
  const fit = j.fitBrief as FitBrief | null;
  const line = fit?.source === "ai" && fit.why[0] ? fit.why[0] : bestAccomplishment(j)[0];
  return /[.!?]$/.test(line.trim()) ? line.trim() : `${line.trim()}.`;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const money = (n: number | null) => (n ? `$${Math.round(n / 1000)}K` : null);
const isWeb = (u: string) => /^https?:\/\//i.test(u);
const day = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Phoenix" });

// The briefing's purple palette. Every gradient has a solid colour first, because Outlook desktop drops gradients.
const BRAND = "#5D36FF", MAGENTA = "#A100C2", INK = "#1a0f4d", BODY = "#334155", MUTED = "#64748b", LINE = "#e4dcff", TINT = "#f6f3ff";
const GRAD = (deg = 120) => `background-color:${BRAND};background-image:linear-gradient(${deg}deg,${BRAND} 0%,${MAGENTA} 100%)`;
const FONT = "font-family:'Segoe UI',Inter,Arial,sans-serif";

/** A link styled as a button, built as a table so it keeps its shape in Outlook. */
const button = (href: string, label: string, primary: boolean) => `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="display:inline-table;border-collapse:separate;margin:0 8px 0 0"><tr><td ${primary ? `bgcolor="${BRAND}"` : ""} style="${primary ? GRAD(90) : `background-color:#ffffff;border:1px solid ${BRAND}`};border-radius:8px;padding:9px 16px"><a href="${esc(href)}" style="${FONT};color:${primary ? "#ffffff" : BRAND};font-size:14px;font-weight:700;text-decoration:none;display:inline-block">${label}</a></td></tr></table>`;

export function alertEmail(input: AlertJob[] | AlertRole[], base: string) {
  const roles: AlertRole[] = input.length && "jobs" in input[0] ? (input as AlertRole[]) : groupRoles(input as AlertJob[]);
  const home = isWeb(base) ? base.replace(/\/+$/, "") : "";
  const top = roles[0].jobs[0];
  const companies = [...new Set(roles.map((r) => r.jobs[0].company.name))];
  const subject = roles.length === 1
    ? `New ${effectiveScore(top)}-point match: ${top.title} at ${top.company.name}`
    : `${roles.length} new high-fit roles: ${companies.slice(0, 3).join(", ")}${companies.length > 3 ? " and more" : ""}`;

  const cards = roles.map(({ jobs, why }) => {
    const j = jobs[0];
    const mine = home ? `${home}/jobs/${j.id}` : j.applyUrl;
    const pay = money(j.oteMax ?? j.oteMin) ? `${money(j.oteMax ?? j.oteMin)} OTE` : money(j.salaryMax ?? j.salaryMin) ? `${money(j.salaryMax ?? j.salaryMin)} base` : null;
    const places = [...new Set(jobs.map(placeLabel))].join(" or ");
    const facts = [esc(j.company.name), esc(places), pay ? `<b style="color:${BRAND}">${pay}</b>` : `<span style="color:${MUTED}">Pay not published</span>`].join(`<span style="color:#b9acf5">&nbsp;&nbsp;|&nbsp;&nbsp;</span>`);
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;margin:0 0 14px;border:1px solid ${LINE};border-radius:12px;background-color:#ffffff">
<tr><td bgcolor="${BRAND}" style="${GRAD(90)};height:5px;line-height:5px;font-size:0;border-radius:12px 12px 0 0">&nbsp;</td></tr>
<tr><td style="padding:16px 18px 18px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse"><tr>
    <td style="vertical-align:top;padding-right:12px">
      <a href="${esc(mine)}" style="${FONT};color:${INK};font-size:18px;font-weight:700;line-height:24px;text-decoration:none">${esc(j.title)}</a>
      <div style="${FONT};color:${BODY};font-size:14px;line-height:21px;margin-top:4px">${facts}</div>
    </td>
    <td width="64" style="vertical-align:top;text-align:center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="right" style="border-collapse:separate"><tr><td bgcolor="${BRAND}" width="52" height="52" style="${GRAD(135)};width:52px;height:52px;border-radius:26px;text-align:center;vertical-align:middle;${FONT};color:#ffffff;font-size:20px;font-weight:800">${effectiveScore(j)}</td></tr>
      <tr><td style="${FONT};color:${MUTED};font-size:11px;font-weight:600;text-align:center;padding-top:3px">fit score</td></tr></table>
    </td>
  </tr></table>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;margin-top:12px"><tr><td bgcolor="${TINT}" style="background-color:${TINT};border-left:3px solid ${MAGENTA};border-radius:0 8px 8px 0;padding:9px 12px;${FONT};font-size:14px;line-height:20px;color:${BODY}"><b style="color:${MAGENTA}">Why you:</b> ${esc(why)}</td></tr></table>
  <div style="${FONT};font-size:12px;color:${MUTED};margin:10px 0 12px">${j.postedAt ? `Posted ${day(j.postedAt)}` : ""}${jobs.length > 1 ? ` &nbsp;·&nbsp; One role listed in ${jobs.length} locations` : ""}</div>
  ${button(mine, home ? "Open in Command Center" : `View on ${esc(j.company.name)}`, true)}${home && j.applyUrl ? button(j.applyUrl, `Apply on ${esc(j.company.name)}`, false) : ""}
</td></tr></table>`;
  }).join("\n");

  const html = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse"><tr><td align="left">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:640px;border-collapse:separate">
<tr><td bgcolor="${BRAND}" style="${GRAD()};padding:20px 22px;border-radius:12px 12px 0 0">
  <div style="${FONT};color:#ffffff;font-size:22px;font-weight:700;line-height:28px">${roles.length === 1 ? "New High-Fit Role" : `${roles.length} New High-Fit Roles`}</div>
  <div style="${FONT};color:#f1eaff;font-size:14px;font-weight:600;margin-top:2px">Posted in the last ${NEW_POSTING_DAYS} days &nbsp;·&nbsp; Phoenix area or remote</div>
</td></tr>
<tr><td bgcolor="#faf8ff" style="background-color:#faf8ff;padding:16px 16px 4px;border:1px solid ${LINE};border-top:0;border-radius:0 0 12px 12px">
${cards}
<div style="${FONT};color:${MUTED};font-size:12px;line-height:18px;margin:2px 2px 12px">Early applicants get read first. Sent for new roles at or above your alert threshold; change it in Settings.</div>
</td></tr></table>
</td></tr></table>`;
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
  const roles = groupRoles(jobs);
  // The same fit assessment the morning briefing uses (and caches), so "why you" reads like her resume, not keywords.
  const lead = roles.map((r) => r.jobs[0]);
  const rows = await db.contact.groupBy({ by: ["companyId"], where: { companyId: { in: lead.map((j) => j.companyId) } }, _count: true }).catch(() => []);
  const fits = await ensureFitBriefs(db, lead, { connections: new Map(rows.map((r) => [r.companyId!, r._count])), minScore: user.alertMinScore, allowDelegate: true }, now).catch(() => null);
  for (const r of roles) { const f = fits?.get(r.jobs[0].id)?.fit; if (f?.source === "ai" && f.why[0]) r.why = f.why[0]; }
  const { subject, html } = alertEmail(roles, base);
  const r = await deliver(db, to, subject, html, opts.fetch);
  // A failure is retried next hour; with nothing set up to send email, the in-app alert is all there is.
  if (r.ok || r.via === null) await db.job.updateMany({ where: { id: { in: jobs.map((j) => j.id) } }, data: { alertedAt: now } });
  return { sent: r.ok ? roles.length : 0, detail: r.detail };
}
