// Writes a follow-up and saves it to her Outlook Drafts: the hiring manager note, the recruiter
// follow-up, or an interview follow-up she already generated in Interview prep.
import { z } from "zod";
import { aiError, aiNotConfigured, route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { assistantConfigured } from "@/lib/assistant";
import { mailbox, OUTLOOK_DRAFTS } from "@/lib/mail/outlook";
import { outreachPlan, writeOutreach, OUTREACH_LABEL } from "@/lib/outreach";
import { splitOutreach } from "@/lib/outreach";

export const maxDuration = 300;

export const POST = route("EDITOR", async (req, _c, u) => {
  const b = z.object({ applicationId: z.string(), kind: z.enum(["hiring_manager", "recruiter", "interview_followup"]), prepId: z.string().optional(), to: z.string().email().optional().or(z.literal("")) }).parse(await req.json());
  const box = await mailbox(prisma);
  if (!box) return Response.json({ error: "Connect Outlook in Settings first, so the draft can go to your Drafts folder." }, { status: 400 });
  const plan = await outreachPlan(prisma, b.applicationId);
  let subject: string, body: string, linkedin = "", issues: unknown[] = [], to: string | null = b.to || null, replyToId: string | null = null, label: string;
  if (b.kind === "interview_followup") {
    const prep = await prisma.interviewPrep.findFirstOrThrow({ where: { id: b.prepId, applicationId: b.applicationId, kind: "followup" } });
    ({ subject, body } = splitOutreach((prep.output ?? "").split(/\n-{3}\s*\n/)[0], `${plan.app.title}: following up`));
    label = "Interview follow-up";
    // Reply in the thread of the last person who wrote, when there is one.
    replyToId = !to ? plan.recruiter?.replyToId ?? null : null;
  } else {
    if (!assistantConfigured()) return aiNotConfigured("Follow-up drafts");
    const who = b.kind === "recruiter" ? plan.recruiter : plan.hiringManager;
    to = to ?? who?.email ?? null;
    replyToId = !b.to && b.kind === "recruiter" ? who?.replyToId ?? null : null;
    try { ({ subject, body, linkedin, issues } = await writeOutreach(b.applicationId, b.kind, who?.name ?? null)); } catch (e) { return aiError(e); }
    label = OUTREACH_LABEL[b.kind];
  }
  const d = await box.draft({ to, subject, body, replyToId });
  await prisma.activity.create({ data: { applicationId: b.applicationId, kind: "email", body: `${label} saved to Outlook Drafts${to ? ` (to ${to})` : replyToId ? " (reply in the recruiter's thread)" : " (add the recipient)"}:\nSubject: ${subject}\n\n${body}` } });
  await prisma.auditLog.create({ data: { userId: u.sub, entity: "Application", entityId: b.applicationId, action: "draft_email", changes: { kind: b.kind } } });
  return { subject, body, linkedin, issues, to, inThread: !!replyToId, webLink: d.webLink ?? OUTLOOK_DRAFTS };
});
