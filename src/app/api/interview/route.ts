import { z } from "zod";
import { aiError, aiNotConfigured, route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { assistantConfigured } from "@/lib/assistant";
import { MOCK_OPENER, PERSONAS, loadInterview, mockTurn, writeFollowup, writePrep, type MockMessage } from "@/lib/interview";

export const maxDuration = 300;

// Starts a prep sheet, a mock interview (returns the first question) or a follow-up email from her notes.
export const POST = route("EDITOR", async (req, _c, u) => {
  if (!assistantConfigured()) return aiNotConfigured("Interview prep");
  const b = z.object({ applicationId: z.string(), kind: z.enum(["prep", "mock", "followup"]), persona: z.enum(PERSONAS), notes: z.string().max(20000).optional() }).parse(await req.json());
  if (b.kind === "followup" && !b.notes?.trim()) return Response.json({ error: "Paste your notes from the interview first." }, { status: 400 });
  const { app, resumeText, title, context } = await loadInterview(b.applicationId);
  if (resumeText.trim().split(/\s+/).length < 100) return Response.json({ error: "Upload a text-based resume to the Resume Library first. Prep only uses facts from it." }, { status: 400 });

  try {
    let data: { output?: string; messages?: MockMessage[]; input?: string };
    if (b.kind === "prep") data = { output: await writePrep(b.persona, context) };
    else if (b.kind === "followup") data = { input: b.notes, output: await writeFollowup(b.persona, b.notes!, context) };
    else {
      const history: MockMessage[] = [{ role: "user", content: MOCK_OPENER }];
      data = { messages: [...history, { role: "assistant", content: await mockTurn(b.persona, app.company.name, title, context, history) }] };
    }
    const prep = await prisma.interviewPrep.create({ data: { applicationId: app.id, kind: b.kind, persona: b.persona, ...data } });
    if (b.kind === "followup") await prisma.activity.create({ data: { applicationId: app.id, kind: "interview", body: `Interview debrief (${b.persona.replace("_", " ")}):\n${b.notes}` } });
    await prisma.auditLog.create({ data: { userId: u.sub, entity: "InterviewPrep", entityId: prep.id, action: "create", changes: { kind: b.kind, persona: b.persona } } });
    return prep;
  } catch (e) { return aiError(e); }
});
