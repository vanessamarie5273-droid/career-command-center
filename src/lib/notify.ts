// Sends the app's own emails (instant alerts, the morning briefing) to her: through Resend when it is
// set up, otherwise from her connected Outlook mailbox to her own address.
import type { PrismaClient } from "@prisma/client";
import { emailConfigured, sendEmail } from "./email";
import { mailbox, type Fetch } from "./mail/outlook";

export type Delivery = { ok: boolean; detail: string; via: "resend" | "outlook" | null };

export async function deliver(db: PrismaClient, to: string, subject: string, html: string, f?: Fetch): Promise<Delivery> {
  if (emailConfigured()) {
    const r = await sendEmail(to, subject, html);
    await db.integrationStatus.upsert({ where: { id: "email" }, create: { id: "email", name: "Email (Resend)", status: r.ok ? "connected" : "error", detail: r.detail }, update: { status: r.ok ? "connected" : "error", detail: r.detail, checkedAt: new Date() } });
    return { ...r, via: "resend" };
  }
  const box = await mailbox(db, f).catch(() => null);
  if (box) {
    try { await box.send(to, subject, html); return { ok: true, detail: "sent from Outlook", via: "outlook" }; }
    catch (e) { return { ok: false, detail: `Outlook: ${(e as Error).message.slice(0, 200)}`, via: "outlook" }; }
  }
  return { ok: false, detail: "Email not configured: connect Outlook in Settings (or set RESEND_API_KEY / ALERT_FROM_EMAIL)", via: null };
}

/** Where her alerts go: the alert address in Settings, else the connected mailbox, else her sign-in email. */
export async function alertAddress(db: PrismaClient) {
  const [user, acct] = await Promise.all([db.user.findFirst({ orderBy: { createdAt: "asc" } }), db.mailAccount.findUnique({ where: { id: "outlook" } })]);
  // Her job-search mail is Outlook. When the Outlook mailbox is connected, alerts always go there, whatever an
  // older setting says (it once held her personal Gmail). The setting only applies when Outlook is not connected.
  return { user, to: acct?.email || user?.alertEmail || user?.email || null };
}
