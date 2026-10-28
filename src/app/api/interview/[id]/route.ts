import { z } from "zod";
import { aiError, aiNotConfigured, route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { assistantConfigured } from "@/lib/assistant";
import { MOCK_FINISH, PERSONAS, loadInterview, mockTurn, type MockMessage } from "@/lib/interview";

export const maxDuration = 300;
type Ctx = { params: Promise<{ id: string }> };

// One mock-interview turn: her answer in, the interviewer's feedback and next question out. finish ends with a debrief.
export const POST = route<Ctx>("EDITOR", async (req, { params }) => {
  if (!assistantConfigured()) return aiNotConfigured("Interview prep");
  const b = z.object({ answer: z.string().max(8000).optional(), finish: z.boolean().optional() }).parse(await req.json());
  const prep = await prisma.interviewPrep.findUniqueOrThrow({ where: { id: (await params).id } });
  if (prep.kind !== "mock") return Response.json({ error: "Not a mock interview" }, { status: 400 });
  const said = b.finish ? MOCK_FINISH : b.answer?.trim();
  if (!said) return Response.json({ error: "Type your answer first." }, { status: 400 });
  const { app, title, context } = await loadInterview(prep.applicationId);
  const history = [...((prep.messages ?? []) as MockMessage[]), { role: "user" as const, content: said }];
  try {
    const reply = await mockTurn(z.enum(PERSONAS).parse(prep.persona), app.company.name, title, context, history);
    return prisma.interviewPrep.update({ where: { id: prep.id }, data: { messages: [...history, { role: "assistant", content: reply }] } });
  } catch (e) { return aiError(e); }
});
