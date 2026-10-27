// Interview prep by buying-committee persona: prep sheets, mock interviews with scored feedback, and follow-up emails.
// Built on the Application Kit's context, so answers use only facts from her resume and stated profile.
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "./db";
import { BRIEF, SYSTEM, kitContext, writeOver, type KitInput } from "./kit";
import { MOCK_FINISH, MOCK_OPENER, PERSONAS, PERSONA_LABEL, type MockMessage, type Persona } from "./personas";

export { MOCK_FINISH, MOCK_OPENER, PERSONAS, PERSONA_LABEL, type MockMessage, type Persona };

export const PERSONA_FOCUS: Record<Persona, string> = {
  recruiter: "clear fit, low risk, easy to advance: role match, compensation range, timing, motivation for leaving, red flags",
  hiring_manager: "ramp speed, pipeline, quota attainment, coachability: how she builds pipeline, forecasts, runs deals and takes coaching",
  executive: "strategic impact, revenue growth, competitive position: how she would move the number and the market",
  peer: "collaboration, credibility, shared wins: how she works with SEs, partners, marketing and other reps",
  hr: "culture fit, stability, decision safety: tenure, how she handles conflict and setbacks, why this company",
};

export const MOCK_QUESTIONS = 6;

/** Kit context plus what the application record knows about this process. */
export function interviewContext(input: KitInput, app: { stage: string; recruiterName: string | null; hiringManagerName: string | null; interviewNotes: string | null; pov: string | null }) {
  return [
    kitContext(input),
    `PROCESS SO FAR: stage ${app.stage.toLowerCase().replace(/_/g, " ")}.${app.recruiterName ? ` Recruiter: ${app.recruiterName}.` : ""}${app.hiringManagerName ? ` Hiring manager: ${app.hiringManagerName}.` : ""}`,
    app.interviewNotes ? `HER INTERVIEW NOTES:\n${app.interviewNotes.slice(0, 8000)}` : "",
    app.pov ? `HER POINT OF VIEW FOR THIS ROLE (from her Application Kit):\n${app.pov.slice(0, 6000)}` : "",
  ].filter(Boolean).join("\n\n");
}

const prepTask = (p: Persona) => `Write an interview prep sheet for her conversation with the ${PERSONA_LABEL[p].toLowerCase()}, who cares about ${PERSONA_FOCUS[p]}.
Sections:
WHAT THEY NEED FROM THIS CONVERSATION: two sentences.
THE ONE THING TO LAND: one sentence she should make sure they remember.
LIKELY QUESTIONS: eight questions this person is likely to ask, drawn from the posting and their role. Under each, a drafted answer of 60 to 110 words in her voice that answers What do you need? Why am I built for it? Why does it matter now? Use only her facts; where she needs a story the resume does not hold, write "[Your example: ...]" describing what kind of story fits.
QUESTIONS TO ASK THEM: four sharp questions that show she has started doing the job and that set up the next conversation.
WATCH-OUTS: two or three places where her background could read as a risk to this person, and the reframe for each.`;

const followupTask = (p: Persona, notes: string) => `She just finished an interview with the ${PERSONA_LABEL[p].toLowerCase()}. Her notes:
"""
${notes.slice(0, 12000)}
"""
Write the follow-up email she sends today, under 180 words. Start with "Subject:" on its own line. Recap the one priority they named, in their words from her notes. Add one specific insight or idea that moves that priority forward, using only her facts and the context. Ask for the next step by name (a meeting with a specific person, or the next stage), and if natural, ask who else she should speak with. Confident, warm, no gratitude-heavy opener: one short line of thanks at most. Sign "Kindest Regards," and her name.
Then, after a line with "---", write NEXT STEPS: three bullets on what she should do before the next conversation.`;

const mockInstructions = (p: Persona, company: string, title: string) => `You are the ${PERSONA_LABEL[p].toLowerCase()} at ${company}, interviewing Vanessa for ${title}. You care about ${PERSONA_FOCUS[p]}. Be realistic: probe vague answers, ask for numbers, and push on risks in her background the way a real interviewer at this company would.

How the session runs:
- Ask one question at a time. Ask ${MOCK_QUESTIONS} questions in total, drawn from the posting and your role.
- After each of her answers, reply in this exact shape, then stop:
FEEDBACK
Results x/5 · Numbers x/5 · Stakes x/5 · Brevity x/5
What landed: one sentence.
Tighten: one sentence on the biggest fix.
Stronger version: her answer rewritten in under 110 words, using ONLY facts from RESUME, PROFILE FACTS and what she said. Never invent figures or stories; if a number would help and she has none, write [your number].
NEXT QUESTION
(your next question, or "That's my last question." after question ${MOCK_QUESTIONS})
- When she asks to end, or after her answer to question ${MOCK_QUESTIONS}, give OVERALL DEBRIEF instead: would you advance her and why, her two strongest moments, the two answers to rework, and the one question she should prepare for next round.
- Stay in role as the interviewer for questions. Plain text only, no markdown.

Her standard, which is what you score against:
${BRIEF}

Scoring: Results = outcomes, not activities. Numbers = specific, verifiable figures from her record. Stakes = ties her answer to this company's problem and why it matters now. Brevity = under about 90 seconds spoken, no filler.`;

export async function writePrep(persona: Persona, context: string) {
  return writeOver(new Anthropic(), SYSTEM, context, [{ role: "user", content: prepTask(persona) }], "high", "prep sheet");
}

export async function writeFollowup(persona: Persona, notes: string, context: string) {
  return writeOver(new Anthropic(), SYSTEM, context, [{ role: "user", content: followupTask(persona, notes) }], "medium", "follow-up email");
}

/** Next interviewer turn. The history starts with MOCK_OPENER and alternates; the caller appends her answer before calling. */
export async function mockTurn(persona: Persona, company: string, title: string, context: string, history: MockMessage[]) {
  return writeOver(new Anthropic(), mockInstructions(persona, company, title), context, history, "medium", "interview turn");
}

/** Everything an interview call needs for one application: its company, job, best resume text and latest kit. */
export async function loadInterview(applicationId: string) {
  const a = await prisma.application.findUniqueOrThrow({ where: { id: applicationId }, include: { company: { include: { news: { orderBy: { createdAt: "desc" }, take: 5 } } }, job: { include: { kits: { orderBy: { createdAt: "desc" }, take: 1 } } }, resume: { select: { text: true } } } });
  const kit = a.job?.kits[0];
  const kitResume = kit?.resumeDocId ? await prisma.document.findUnique({ where: { id: kit.resumeDocId }, select: { text: true } }) : null;
  const original = await prisma.document.findFirst({ where: { kind: "resume", isTailored: false }, orderBy: { createdAt: "desc" }, select: { text: true } });
  const resumeText = a.resume?.text || kitResume?.text || original?.text || "";
  const c = a.company;
  const input: KitInput = {
    resumeText,
    job: { title: a.job?.title ?? a.title, location: a.job?.location ?? null, descriptionText: a.job?.descriptionText ?? a.jdSnapshot, requiredQuals: a.job?.requiredQuals ?? null, preferredQuals: a.job?.preferredQuals ?? null },
    company: { name: c.name, category: c.category, maturity: c.maturity, description: c.description, keyProducts: c.keyProducts, customers: c.customers, buyerPersonas: c.buyerPersonas, risks: c.risks, news: c.news.map((n) => n.headline) },
  };
  const pov = (kit?.parts as Record<string, string> | undefined)?.pov ?? null;
  return { app: a, resumeText, title: input.job.title, context: interviewContext(input, { stage: a.stage, recruiterName: a.recruiterName, hiringManagerName: a.hiringManagerName, interviewNotes: a.interviewNotes, pov }) };
}
