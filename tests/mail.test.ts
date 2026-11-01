import { describe, expect, it, beforeAll, afterAll, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { baseDomain, classify, nextStage, titleMatch } from "@/lib/mail/classify";
import { seal, unseal } from "@/lib/mail/seal";
import { connect, accessToken, mailbox, type Mailbox, type MailMessage } from "@/lib/mail/outlook";
import { syncMailbox, undoEmailEvent, matchCompany, repairEarlyReads, clearStaleAlerts } from "@/lib/mail/sync";
import { splitOutreach } from "@/lib/outreach";
import { testDb, makeCompany } from "./setup-db";

process.env.SESSION_SECRET ||= "test-secret-test-secret-test-secret-123";
const person = { email: "jane@acme.com", isPersonAtCompany: true };
const system = { email: "no-reply@greenhouse.io", isPersonAtCompany: false };

describe("reading company email", () => {
  it("tells rejections, offers, interview requests, confirmations and recruiter replies apart", () => {
    expect(classify("Your application to Acme", "Thank you for applying. Unfortunately, we have decided to move forward with other candidates.", system)?.kind).toBe("rejection");
    expect(classify("Update", "After careful review we regret to inform you that we will not be moving forward.", system)?.kind).toBe("rejection");
    expect(classify("Offer", "We are pleased to extend you an offer for the Enterprise AE role.", person)?.kind).toBe("offer");
    expect(classify("Next steps", "Hi Vanessa, I'd love to schedule a call this week. What is your availability?", person)?.kind).toBe("interview");
    expect(classify("Acme application", "Thank you for your application for Strategic AE. We will review it shortly.", system)?.kind).toBe("confirmation");
    expect(classify("Quick question", "Hi Vanessa, I saw your application for the West role and had a question about your background.", person)?.kind).toBe("reply");
    expect(classify("Acme product update", "Our new release ships today. Read the blog.", person)).toBeNull();
    expect(classify("Your application", "Thanks for applying!", { email: "careers@acme.com", isPersonAtCompany: true })?.kind).toBe("confirmation");
    // A confirmation that mentions interviews later is still a confirmation.
    expect(classify("Thank you for applying to Databricks!", "Our team will review your application. If your background is a fit, a recruiter will reach out to schedule a call.", system)?.kind).toBe("confirmation");
    expect(classify("Thank you for applying to Senior Manager, Enterprise Sales Development at Commure", "We will be in touch about next steps in the process.", system)?.kind).toBe("confirmation");
    // A real invitation still wins, even with a thank-you.
    expect(classify("Thanks for applying!", "We'd like to schedule a call with our hiring manager. Book a time on calendly.com/acme/30min", system)?.kind).toBe("interview");
    // "Unfortunately" about something else is not a rejection.
    expect(classify("Re: call", "Unfortunately I'm out Friday, could we schedule a call Monday? Send me times that work.", person)?.kind).toBe("interview");
  });

  it("moves applications forward only, and never reopens a closed one", () => {
    expect(nextStage("confirmation", "READY_TO_APPLY")).toBe("APPLIED");
    expect(nextStage("confirmation", "INTERVIEWING")).toBeNull();
    expect(nextStage("reply", "APPLIED")).toBe("RECRUITER_CONTACT");
    expect(nextStage("interview", "APPLIED")).toBe("RECRUITER_CONTACT");
    expect(nextStage("interview", "RECRUITER_CONTACT")).toBe("INTERVIEWING");
    expect(nextStage("interview", "FINAL_INTERVIEW")).toBeNull();
    expect(nextStage("offer", "FINAL_INTERVIEW")).toBe("OFFER");
    expect(nextStage("rejection", "INTERVIEWING")).toBe("REJECTED");
    expect(nextStage("rejection", "WITHDRAWN")).toBeNull();
  });

  it("finds the employer behind a sender, including mail sent through a hiring system", () => {
    expect(baseDomain("jane@talent.acme.com".split("@")[1])).toBe("acme.com");
    expect(baseDomain("https://www.acme.co.uk/careers")).toBe("acme.co.uk");
    const cos = [{ id: "1", name: "Acme", domains: new Set(["acme.com"]), apps: [] }, { id: "2", name: "Acme Robotics", domains: new Set(["acmerobotics.ai"]), apps: [] }];
    const m = (fromEmail: string, fromName: string | null, subject: string, preview = "") => ({ fromEmail, fromName, subject, preview });
    expect(matchCompany(m("jane@mail.acme.com", "Jane", "Hello"), cos)).toMatchObject({ co: { id: "1" }, direct: true });
    expect(matchCompany(m("no-reply@greenhouse.io", "Acme Robotics Recruiting", "Your application"), cos)).toMatchObject({ co: { id: "2" }, direct: false });
    expect(matchCompany(m("no-reply@ashbyhq.com", null, "Update on your application", "Thanks for applying to Acme. We..."), cos)).toMatchObject({ co: { id: "1" } });
    expect(matchCompany(m("friend@gmail.com", "Pat", "Acme newsletter"), cos)?.co.id).toBe("1");
    expect(matchCompany(m("news@other.com", "Other", "Weekly digest"), cos)).toBeNull();
    expect(titleMatch("Enterprise Account Executive, West", "Re: Enterprise Account Executive - West")).toBe(1);
  });

  it("seals tokens so only this app's secret opens them", () => {
    const s = seal("refresh-token-123");
    expect(s).not.toContain("refresh-token-123");
    expect(unseal(s)).toBe("refresh-token-123");
  });

  it("splits a written follow-up into subject, body and LinkedIn note", () => {
    const o = splitOutreach("Subject: Pipeline in the West\n\nHi [Name],\nBody.\n\nKindest Regards,\nVanessa Morales\n---LINKEDIN---\nShort note.", "x");
    expect(o).toEqual({ subject: "Pipeline in the West", body: "Hi [Name],\nBody.\n\nKindest Regards,\nVanessa Morales", linkedin: "Short note." });
  });
});

describe("Outlook sync", () => {
  let db: PrismaClient;
  beforeAll(() => { db = testDb(); });
  afterAll(() => db.$disconnect());
  beforeEach(async () => { await db.mailAccount.deleteMany(); await db.mailAccount.create({ data: { id: "outlook", email: "vanessa@outlook.com", refreshToken: seal("r"), scopes: "Mail.ReadWrite Mail.Send" } }); });

  const msg = (id: string, over: Partial<MailMessage>): MailMessage => ({ id, conversationId: `c-${id}`, subject: "", fromName: null, fromEmail: "", receivedAt: new Date(), preview: "", ...over });
  const fakeBox = (messages: MailMessage[], bodies: Record<string, string>): Mailbox => ({
    email: "vanessa@outlook.com",
    list: async () => messages, body: async (id) => bodies[id] ?? "",
    draft: async () => ({ id: "d", webLink: null }), send: async () => {},
  });

  async function appAt(name: string, website: string, stage: "APPLIED" | "READY_TO_APPLY") {
    const c = await makeCompany(db, { name, website });
    const job = await db.job.create({ data: { companyId: c.id, fingerprint: `mail-${Math.random()}`, title: "Enterprise Account Executive", applyUrl: "https://example.com/j" } });
    const app = await db.application.create({ data: { companyId: c.id, jobId: job.id, title: job.title, stage, applied: stage === "APPLIED", appliedAt: stage === "APPLIED" ? new Date() : null } });
    if (stage === "APPLIED") await db.task.create({ data: { applicationId: app.id, title: `Follow up on your ${name} application with the recruiter`, source: "system" } });
    return { c, job, app };
  }

  it("moves an application when the recruiter writes, saves them as a contact, and closes the chase task", async () => {
    const { app } = await appAt("Zentrix", "https://www.zentrix.io", "APPLIED");
    const box = fakeBox([msg("m1", { fromEmail: "maria.lopez@zentrix.io", fromName: "Maria Lopez", subject: "Your Enterprise Account Executive application", preview: "Hi Vanessa" })], { m1: "Hi Vanessa,\nI'd love to set up a call this week. What's your availability?\n\nMaria Lopez\nSenior Technical Recruiter, Zentrix" });
    const r = await syncMailbox(db, { box });
    expect(r).toMatchObject({ matched: 1, moved: 1 });
    const a = await db.application.findUniqueOrThrow({ where: { id: app.id }, include: { tasks: true } });
    expect(a.stage).toBe("RECRUITER_CONTACT");
    expect(a.recruiterName).toBe("Maria Lopez");
    expect(a.nextAction).toMatch(/Reply to Maria Lopez/);
    expect(a.tasks.every((t) => t.done)).toBe(true);
    expect(await db.contact.findFirst({ where: { email: "maria.lopez@zentrix.io" } })).toMatchObject({ firstName: "Maria", lastName: "Lopez", role: "recruiter" });
    // The same email is never applied twice.
    expect(await syncMailbox(db, { box })).toMatchObject({ matched: 0, moved: 0 });
  });

  it("reads a rejection sent through a hiring system, and Undo puts it back", async () => {
    const { app } = await appAt("Quorvane", "https://quorvane.com", "APPLIED");
    const box = fakeBox([msg("m2", { fromEmail: "no-reply@us.greenhouse-mail.io", fromName: "Quorvane Hiring", subject: "Update on your application" })], { m2: "Thank you for your interest. Unfortunately we will not be moving forward with your application." });
    await syncMailbox(db, { box });
    expect((await db.application.findUniqueOrThrow({ where: { id: app.id } })).stage).toBe("REJECTED");
    const ev = await db.emailEvent.findUniqueOrThrow({ where: { providerId: "m2" } });
    expect(ev).toMatchObject({ kind: "rejection", prevStage: "APPLIED", newStage: "REJECTED" });
    const alertWhere = { kind: "email_update", link: `/applications/${app.id}` };
    expect(await db.alert.count({ where: alertWhere })).toBe(1);
    await undoEmailEvent(db, ev.id);
    expect(await db.alert.count({ where: alertWhere })).toBe(0);
    const back = await db.application.findUniqueOrThrow({ where: { id: app.id } });
    expect(back).toMatchObject({ stage: "APPLIED", outcome: null });
    expect((await db.emailEvent.findUniqueOrThrow({ where: { id: ev.id } })).undone).toBe(true);
  });

  it("marks a saved role applied when the confirmation arrives, and books the follow-ups", async () => {
    const { app } = await appAt("Lumacore", "https://lumacore.com", "READY_TO_APPLY");
    await syncMailbox(db, { box: fakeBox([msg("m3", { fromEmail: "no-reply@ashbyhq.com", fromName: "Lumacore", subject: "Thanks for applying to Lumacore" })], { m3: "We've received your application for Enterprise Account Executive." }) });
    const a = await db.application.findUniqueOrThrow({ where: { id: app.id }, include: { tasks: true } });
    expect(a).toMatchObject({ stage: "APPLIED", applied: true });
    expect(a.tasks.length).toBe(2);
  });

  it("ignores mail that is not about her applications", async () => {
    await appAt("Brightwell", "https://brightwell.com", "APPLIED");
    const r = await syncMailbox(db, { box: fakeBox([msg("m4", { fromEmail: "news@brightwell.com", fromName: "Brightwell", subject: "Our Q3 product launch" }), msg("m5", { fromEmail: "vanessa@outlook.com", subject: "Brightwell application" })], { m4: "Join our webinar." }) });
    expect(r).toMatchObject({ matched: 0 });
  });

  it("names the email, not a no-reply address, when an automated system asks for availability", async () => {
    const { app } = await appAt("Pellucid", "https://pellucid.ai", "APPLIED");
    await syncMailbox(db, { box: fakeBox([msg("m6", { fromEmail: "no-reply@ashbyhq.com", fromName: "Pellucid Recruiting", subject: "Pellucid: interview invitation" })], { m6: "We'd like to invite you to an interview. Share your availability here." }) });
    const a = await db.application.findUniqueOrThrow({ where: { id: app.id } });
    expect(a.stage).toBe("RECRUITER_CONTACT");
    expect(a.nextAction).toBe("Answer the Pellucid scheduling email (“Pellucid: interview invitation”)");
  });

  it("repairs confirmations the first rules read as interview requests, once", async () => {
    await db.integrationStatus.deleteMany({ where: { id: "mail_rules_v2" } });
    const { app } = await appAt("Kestrelon", "https://kestrelon.com", "APPLIED");
    await moveStageForTest(app.id);
    const ev = await db.emailEvent.create({ data: { providerId: `old-${Math.random()}`, threadId: "t", applicationId: app.id, fromEmail: "no-reply@us.greenhouse-mail.io", subject: "Thank you for applying to Kestrelon!", snippet: "We will reach out to schedule an interview if there's a fit.", receivedAt: new Date(), kind: "interview", action: "Moved to Recruiter Contact", prevStage: "APPLIED", newStage: "RECRUITER_CONTACT", prevApplied: true, createdAt: new Date(Date.now() - 3600_000) } });
    const real = await db.emailEvent.create({ data: { providerId: `old-${Math.random()}`, threadId: "t", applicationId: app.id, fromEmail: "sam@kestrelon.com", subject: "Interview with Kestrelon", snippet: "Could you share your availability for next week?", receivedAt: new Date(), kind: "interview", createdAt: new Date(Date.now() - 3600_000) } });
    expect(await repairEarlyReads(db)).toBe(1);
    const a = await db.application.findUniqueOrThrow({ where: { id: app.id } });
    expect(a).toMatchObject({ stage: "APPLIED", nextAction: null });
    expect(await db.emailEvent.findUniqueOrThrow({ where: { id: ev.id } })).toMatchObject({ kind: "confirmation", undone: true });
    expect((await db.emailEvent.findUniqueOrThrow({ where: { id: real.id } })).kind).toBe("interview");
    expect(await repairEarlyReads(db)).toBe(0);
  });

  it("clears alerts left behind by moves that were undone before alerts were cleaned up", async () => {
    const { app } = await appAt("Pellucid", "https://pellucid.com", "APPLIED");
    await db.emailEvent.create({ data: { providerId: `old-${Math.random()}`, threadId: "t", applicationId: app.id, fromEmail: "no-reply@us.greenhouse-mail.io", subject: "Thank you for applying to Pellucid!", receivedAt: new Date(), kind: "confirmation", action: "Re-read as an application confirmation: no stage change", prevStage: "APPLIED", newStage: "INTERVIEWING", undone: true } });
    const link = `/applications/${app.id}`;
    await db.alert.create({ data: { kind: "email_update", title: "Pellucid: Moved to Interviewing", body: "Interview request from no-reply@us.greenhouse-mail.io: “Thank you for applying to Pellucid!”", link } });
    await db.alert.create({ data: { kind: "email_update", title: "Pellucid: Moved to Offer", body: "Offer from Dana: “Your offer from Pellucid”", link } });
    expect(await clearStaleAlerts(db)).toBe(1);
    expect((await db.alert.findMany({ where: { link } })).map((a) => a.title)).toEqual(["Pellucid: Moved to Offer"]);
  });

  async function moveStageForTest(id: string) {
    await db.application.update({ where: { id }, data: { stage: "RECRUITER_CONTACT", nextAction: "Reply to no-reply@us.greenhouse-mail.io with your availability" } });
  }

  it("connects with Microsoft sign-in, stores sealed tokens, and saves the rotated refresh token", async () => {
    process.env.MICROSOFT_CLIENT_ID = "cid"; process.env.MICROSOFT_CLIENT_SECRET = "secret";
    await db.mailAccount.deleteMany();
    const calls: string[] = [];
    let n = 0;
    const f = async (url: string, init?: RequestInit) => {
      calls.push(url);
      if (url.endsWith("/token")) { n++; return Response.json({ access_token: `at${n}`, refresh_token: `rt${n}`, expires_in: n === 1 ? 0 : 3600, scope: "openid email offline_access User.Read Mail.ReadWrite Mail.Send" }); }
      if (url.includes("/me?")) return Response.json({ mail: "VanessaMMorales@outlook.com" });
      if (url.endsWith("/me/sendMail")) { expect(JSON.parse(String(init?.body)).message.toRecipients[0].emailAddress.address).toBe("vanessammorales@outlook.com"); return new Response(null, { status: 202 }); }
      return new Response("not found", { status: 404 });
    };
    const acct = await connect(db, "code", "https://app.example.com/api/mail/callback", f);
    expect(acct.email).toBe("vanessammorales@outlook.com");
    expect(acct.refreshToken).not.toContain("rt1");
    // The first token expired at once, so the next call refreshes and keeps Microsoft's new refresh token.
    expect(await accessToken(db, f)).toBe("at2");
    expect(unseal((await db.mailAccount.findUniqueOrThrow({ where: { id: "outlook" } })).refreshToken)).toBe("rt2");
    const box = await mailbox(db, f);
    await box!.send("vanessammorales@outlook.com", "Test", "<p>hi</p>");
    expect(calls.some((u) => u.endsWith("/me/sendMail"))).toBe(true);
  });
});
