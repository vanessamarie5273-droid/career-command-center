// Reads her Outlook mailbox for email from companies she is in process with, and moves each
// application along: confirmation → Applied, a recruiter reply or interview request → Recruiter contact
// or Interviewing, an offer → Offer, a rejection → Rejected. Every move is logged and can be undone.
import type { PrismaClient, Stage } from "@prisma/client";
import { markApplied } from "../apply";
import { moveStage } from "../applications";
import { STAGE_LABEL } from "../format";
import { mailbox, type Mailbox, type MailMessage } from "./outlook";
import { baseDomain, classify, isAtsDomain, isAutomated, isFreemail, nextStage, titleMatch, type EmailKind } from "./classify";

const DAY = 86400_000;
const FIRST_SYNC_DAYS = 21;
const OPEN_STAGES: Stage[] = ["RESEARCHING", "PRIORITIZED", "RESUME_PREP", "READY_TO_APPLY", "APPLIED", "RECRUITER_CONTACT", "HIRING_MANAGER", "INTERVIEWING", "FINAL_INTERVIEW", "OFFER", "ON_HOLD"];

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const named = (name: string, hay: string) => new RegExp(`(^|[^a-z0-9])${esc(name.toLowerCase())}([^a-z0-9]|$)`).test(hay.toLowerCase());

type App = Awaited<ReturnType<typeof openApplications>>[number];
async function openApplications(db: PrismaClient) {
  return db.application.findMany({
    where: { stage: { in: OPEN_STAGES } },
    include: { company: { select: { id: true, name: true, website: true, careersUrl: true, linkedinUrl: true } }, job: { select: { id: true, kits: { select: { id: true }, orderBy: { createdAt: "desc" }, take: 1 } } } },
    orderBy: [{ appliedAt: { sort: "desc", nulls: "last" } }, { updatedAt: "desc" }],
  });
}

type Co = { id: string; name: string; domains: Set<string>; apps: App[] };
function companyIndex(apps: App[]) {
  const by = new Map<string, Co>();
  for (const a of apps) {
    const c = by.get(a.companyId) ?? { id: a.companyId, name: a.company.name, domains: new Set<string>(), apps: [] };
    for (const u of [a.company.website, a.company.careersUrl]) { const d = baseDomain(u); if (d && !isAtsDomain(d) && !isFreemail(d)) c.domains.add(d); }
    c.apps.push(a);
    by.set(a.companyId, c);
  }
  return [...by.values()];
}

/** Which company an email is from: its own domain first, then its name on mail sent through a hiring system. */
export function matchCompany(m: Pick<MailMessage, "fromEmail" | "fromName" | "subject" | "preview">, cos: Co[]): { co: Co; direct: boolean } | null {
  const d = baseDomain(m.fromEmail.split("@")[1] ?? "");
  const direct = d && !isAtsDomain(d) && !isFreemail(d) ? cos.filter((c) => c.domains.has(d)) : [];
  if (direct.length === 1) return { co: direct[0], direct: true };
  const pool = direct.length ? direct : cos;
  const longest = (xs: Co[]) => xs.sort((a, b) => b.name.length - a.name.length)[0] ?? null;
  const inHeader = pool.filter((c) => named(c.name, `${m.fromName ?? ""} ${m.subject}`));
  if (inHeader.length) return { co: longest(inHeader)!, direct: direct.length > 0 };
  // Mail from a hiring system that only names the company in its first lines.
  if (isAtsDomain(d)) { const inBody = pool.filter((c) => named(c.name, m.preview)); if (inBody.length === 1) return { co: inBody[0], direct: false }; }
  return null;
}

function pickApplication(co: Co, hay: string) {
  if (co.apps.length === 1) return co.apps[0];
  const scored = co.apps.map((a) => ({ a, s: titleMatch(a.title, hay) }));
  const best = Math.max(...scored.map((x) => x.s));
  return best > 0.5 ? scored.find((x) => x.s === best)!.a : co.apps[0];
}

const RECRUITER = /\b(recruit(er|ing)|talent (acquisition|partner)|sourcer|people partner)\b/i;
const split = (name: string) => { const [first, ...rest] = name.replace(/["']/g, "").split(/\s+/); return { firstName: first, lastName: rest.join(" ") || null }; };

export type SyncResult = { scanned: number; matched: number; moved: number; note: string };

export async function syncMailbox(db: PrismaClient, opts: { box?: Mailbox | null; now?: Date; max?: number } = {}): Promise<SyncResult | null> {
  const box = opts.box === undefined ? await mailbox(db) : opts.box;
  if (!box) return null;
  const now = opts.now ?? new Date();
  const acct = await db.mailAccount.findUnique({ where: { id: "outlook" } });
  const since = acct?.lastSyncAt ? new Date(acct.lastSyncAt.getTime() - 2 * 3600_000) : new Date(now.getTime() - FIRST_SYNC_DAYS * DAY);
  try {
    await repairEarlyReads(db);
    const apps = await openApplications(db);
    const cos = companyIndex(apps);
    const messages = cos.length ? await box.list(since, opts.max ?? 300) : [];
    const seen = new Set((await db.emailEvent.findMany({ where: { providerId: { in: messages.map((m) => m.id) } }, select: { providerId: true } })).map((e) => e.providerId));
    let matched = 0, moved = 0;
    // Oldest first, so a confirmation is read before the interview request that follows it.
    for (const m of [...messages].reverse()) {
      if (seen.has(m.id) || !m.fromEmail || m.fromEmail === box.email) continue;
      const hit = matchCompany(m, cos);
      if (!hit) continue;
      const text = await box.body(m.id).catch(() => m.preview);
      const c = classify(m.subject, text, { email: m.fromEmail, isPersonAtCompany: hit.direct });
      if (!c) continue;
      matched++;
      const app = pickApplication(hit.co, `${m.subject}\n${text}`);
      const r = await applyEmail(db, app, c.kind, m, text, hit.direct);
      if (r.newStage) moved++;
      await db.emailEvent.create({ data: { providerId: m.id, threadId: m.conversationId, applicationId: app.id, companyId: hit.co.id, fromName: m.fromName, fromEmail: m.fromEmail, subject: m.subject.slice(0, 500), snippet: m.preview.slice(0, 500), receivedAt: m.receivedAt, kind: c.kind, action: r.action, prevStage: r.newStage ? app.stage : null, newStage: r.newStage, prevApplied: r.newStage ? app.applied : null } });
      await db.activity.create({ data: { applicationId: app.id, companyId: hit.co.id, kind: "email", body: `Outlook: ${m.fromName ? `${m.fromName} <${m.fromEmail}>` : m.fromEmail}\n“${m.subject}”\nRead as: ${KIND_LABEL[c.kind]} (“${c.why.slice(0, 120)}”)\n${r.action}` } });
      if (r.newStage) await db.alert.create({ data: { kind: "email_update", title: `${hit.co.name}: ${r.action}`, body: `${KIND_LABEL[c.kind]} from ${m.fromName ?? m.fromEmail}: “${m.subject}”`, link: `/applications/${app.id}` } });
      app.stage = (r.newStage as Stage | null) ?? app.stage; // a later email in the same run sees the move
      if (r.newStage) app.applied = app.applied || r.newStage !== "REJECTED";
    }
    const note = `Read ${messages.length} emails since ${since.toLocaleDateString("en-US", { timeZone: "America/Phoenix" })}: ${matched} from companies you're in process with, ${moved} application${moved === 1 ? "" : "s"} moved`;
    await db.mailAccount.update({ where: { id: "outlook" }, data: { lastSyncAt: now, lastSyncNote: note, status: "connected" } });
    return { scanned: messages.length, matched, moved, note };
  } catch (e) {
    await db.mailAccount.updateMany({ where: { id: "outlook" }, data: { lastSyncNote: `Last check failed: ${(e as Error).message.slice(0, 300)}` } });
    throw e;
  }
}

export const KIND_LABEL: Record<EmailKind, string> = { confirmation: "Application received", reply: "Recruiter reply", interview: "Interview request", offer: "Offer", rejection: "Rejection" };

async function applyEmail(db: PrismaClient, app: App, kind: EmailKind, m: MailMessage, text: string, direct: boolean): Promise<{ action: string; newStage: Stage | null }> {
  const to = nextStage(kind, app.stage) as Stage | null;
  let newStage: Stage | null = null;
  if (kind === "confirmation" && !app.applied && app.jobId) {
    await markApplied(db, app.jobId, app.job?.kits[0]?.id ?? null, null);
    newStage = "APPLIED";
  } else if (to && !(kind === "confirmation" && app.applied)) {
    const r = await moveStage(db, app.id, to, null);
    if (r.ok) newStage = to;
  }
  const person = direct && !isAutomated(m.fromEmail);
  const patch: Record<string, unknown> = {};
  if (kind === "interview") { patch.nextAction = person ? `Reply to ${m.fromName ?? m.fromEmail} with your availability` : `Answer the ${app.company.name} scheduling email (“${m.subject.slice(0, 60)}”)`; patch.nextActionDue = new Date(); }
  if (kind === "rejection") patch.outcomeReason = app.outcomeReason ?? `Email from ${app.company.name}: “${m.subject}”`;
  // A real person at the company: keep them as a contact, and as the recruiter when their signature says so.
  if (direct && m.fromName && !isAutomated(m.fromEmail)) {
    const isRecruiter = RECRUITER.test(text.slice(-800)) || RECRUITER.test(m.fromEmail);
    const existing = await db.contact.findFirst({ where: { email: m.fromEmail } });
    if (!existing) await db.contact.create({ data: { companyId: app.companyId, companyName: app.company.name, ...split(m.fromName), email: m.fromEmail, role: isRecruiter ? "recruiter" : null, source: "email", notes: `First wrote ${m.receivedAt.toLocaleDateString("en-US")}: “${m.subject}”` } });
    if (isRecruiter && !app.recruiterName) patch.recruiterName = m.fromName;
  }
  if (Object.keys(patch).length) await db.application.update({ where: { id: app.id }, data: patch });
  // They answered, so the "chase the recruiter" reminder is done.
  if (kind !== "confirmation") await db.task.updateMany({ where: { applicationId: app.id, done: false, title: { startsWith: "Follow up on your" } }, data: { done: true, doneAt: new Date() } });
  const action = newStage === "APPLIED" && kind === "confirmation" ? "Marked applied and booked your follow-ups" : newStage ? `Moved to ${STAGE_LABEL[newStage as keyof typeof STAGE_LABEL]}` : "Logged, no stage change";
  return { action, newStage };
}

/** Put an application back where it was before an email moved it. */
export async function undoEmailEvent(db: PrismaClient, id: string, why = "Undid") {
  const ev = await db.emailEvent.findUniqueOrThrow({ where: { id } });
  if (ev.undone || !ev.prevStage || !ev.applicationId) return ev;
  const app = await db.application.findUnique({ where: { id: ev.applicationId } });
  if (app) {
    const r = await moveStage(db, app.id, ev.prevStage, null);
    if (!r.ok) throw new Error(r.error);
    if (ev.prevApplied === false) await db.application.update({ where: { id: app.id }, data: { applied: false, appliedAt: null } });
    if (ev.newStage === "REJECTED") await db.application.update({ where: { id: app.id }, data: { outcome: null, outcomeReason: null } });
    await db.activity.create({ data: { applicationId: app.id, kind: "email", body: `${why} “${ev.action}” from the email “${ev.subject}”. Back to ${STAGE_LABEL[ev.prevStage as keyof typeof STAGE_LABEL]}.` } });
  }
  return db.emailEvent.update({ where: { id }, data: { undone: true } });
}

/**
 * The first version of the rules read "thank you for applying" emails that mention scheduling interviews later
 * as interview requests, and named no-reply addresses in the next action. Re-read those events with the current
 * rules from their subject and preview, put back any stage they moved, and clear the bad next action. Runs once
 * per event: events written after the current rules shipped are left alone.
 */
export async function repairEarlyReads(db: PrismaClient) {
  const marker = await db.integrationStatus.upsert({ where: { id: "mail_rules_v2" }, create: { id: "mail_rules_v2", name: "Email reading rules", status: "connected", detail: "v2: confirmations win over later-interview mentions" }, update: {} });
  const events = await db.emailEvent.findMany({ where: { kind: "interview", createdAt: { lt: marker.checkedAt } } });
  let fixed = 0;
  for (const ev of events) {
    const now = classify(ev.subject, ev.snippet ?? "", { email: ev.fromEmail, isPersonAtCompany: false });
    // Only emails that positively read as a confirmation; a real invitation can sit past the stored preview.
    if (now?.kind !== "confirmation") continue;
    if (ev.newStage && !ev.undone) await undoEmailEvent(db, ev.id, "Re-read the email as an application confirmation and undid");
    if (ev.applicationId) {
      const app = await db.application.findUnique({ where: { id: ev.applicationId } });
      if (app?.nextAction && app.nextAction === `Reply to ${ev.fromName ?? ev.fromEmail} with your availability`) await db.application.update({ where: { id: app.id }, data: { nextAction: null, nextActionDue: null } });
    }
    await db.emailEvent.update({ where: { id: ev.id }, data: { kind: "confirmation", action: "Re-read as an application confirmation: no stage change" } });
    fixed++;
  }
  return fixed;
}
