// Application Kit: per-job tailored resume, Why Me letter, point of view, buying-committee notes and form answers.
// Generated text may only use facts from her resume and stated profile; checkKit() flags anything that slips through.
import Anthropic from "@anthropic-ai/sdk";
import { MODEL } from "./assistant";
import { PROFILE } from "./profile";
import { positioning } from "./positioning";
import { LETTER_EXAMPLE } from "./letterStyle";
import { KIT_LABEL, KIT_PARTS, type KitChecks, type KitIssue, type KitPart, type KitParts } from "./kitParts";

export { KIT_LABEL, KIT_PARTS, type KitChecks, type KitIssue, type KitPart, type KitParts };

// Her operating standard, condensed from the project brief. Every part is written to it.
export const BRIEF = [
  "Run the search like a strategic deal: the company is the account, the hiring team is the buying committee, other candidates are competitors.",
  "Lead with insight about their business, not a resume recap. Start from the company's real, high-stakes problem: a missed number, stalled pipeline, a new market, a key account at risk, a team that needs leadership.",
  "Short sentences. Clear stakes. No filler.",
  "Sell outcomes, credibility and certainty, not job history. Results with numbers, never lists of responsibilities.",
  "Direct, confident and human. Never grateful for the opportunity, never 'passionate about', never generic resume language.",
  "Position her as the lowest-risk, highest-impact decision on their table: she has already started doing the job.",
  "Every 'why me' answers three questions: What do you need? Why am I built for it? Why does it matter now?",
  "Every message should create the next conversation.",
].map((l) => `- ${l}`).join("\n");

export type KitInput = {
  resumeText: string;
  job: { title: string; location: string | null; descriptionText: string | null; requiredQuals: string | null; preferredQuals: string | null };
  company: { name: string; category: string; maturity: string | null; description: string | null; keyProducts: string | null; customers: string | null; buyerPersonas: string | null; risks: string | null; news: string[] };
};

const SYSTEM = `You write job-search material for Vanessa, a senior enterprise sales executive.

FACT RULES (absolute):
- Anything about her (employers, titles, dates, numbers, scope, credentials, achievements) must come from RESUME or PROFILE FACTS. Never invent, round up or combine figures. If a requirement is not evidenced, do not claim it.
- Facts about the company come only from COMPANY and JOB POSTING. When you infer their likely problem, phrase it as an inference ("The posting points to..."), never as known fact. Never invent company figures, customers or people.
- Company profiles are AI-compiled and unverified; lean on the posting first.

HER STANDARD:
${BRIEF}

FORMAT: plain text only. No markdown: no #, no **, no tables. Section headings in ALL CAPS on their own line. Bullets start with "- ". Output only the requested document, with no preamble or closing remarks.`;

const TASK: Record<KitPart, string> = {
  resume: `Rewrite RESUME for this role.
- Keep every employer, title, date, credential and number exactly as written. Keep the contact details at the top unchanged.
- You may reorder sections and bullets, reword for emphasis, and cut what does not serve this role.
- Open with a SUMMARY of two or three sentences aimed at the core problem this role exists to solve.
- Lead each bullet with a result. Use the posting's own terms where her experience genuinely matches them.
- Use plain ATS-safe headings in ALL CAPS: SUMMARY, EXPERIENCE, EDUCATION, SKILLS (and any others already in the resume).`,
  letter: `Write a cover letter in Vanessa's own voice. LETTER EXAMPLE below is one she wrote for another company: match its structure, paragraph rhythm, warmth, length (350 to 420 words) and sign-off. Never reuse its company-specific lines.
Open with "Dear {company} Hiring Team,". Then five paragraphs, in order:
1. What interests her most about this role: the company's market moment and the business problem the role exists to solve, in their terms, from the posting and company context.
2. Her SAP track record mapped to that problem: revenue, recognition, how she runs a deal, and one specific proof story from her facts.
3. Building and scaling new sales motions (the North America Digital Hub) with its numbers, framed for what this role needs.
4. Why the combination fits this role: name the role's real responsibilities from the posting, and what she enjoys about that work.
5. Close: tie her experience to the company's growth as the role's focus becomes a bigger priority for their industry, and ask for the conversation.
Sign off "Kindest Regards," then her name as it appears on the resume.

LETTER EXAMPLE:
${LETTER_EXAMPLE}`,
  pov: `Write a one-page point of view she can send to the hiring manager or bring to the interview. Under 450 words. Sections:
THE PROBLEM: the highest-stakes problem this role exists to solve, stated as an inference from the posting and company context.
MY POSITION: what the role must achieve in year one, and one assumption about the role worth challenging, framed constructively.
30-60-90 DAY PLAN: three blocks (FIRST 30 DAYS, DAYS 31-60, DAYS 61-90), three bullets each, concrete actions with measurable outcomes. Do not promise revenue figures.
WHY ME: three sentences mapping her results to the problem.
QUESTIONS TO VALIDATE: three sharp questions for the hiring manager.`,
  committee: `Write buying-committee notes for each person in the hiring process. For each, a heading in ALL CAPS and three bullets: what they care about, the one proof point from her facts that lands with them, and one question she should ask them.
RECRUITER: clear fit, low risk, easy to advance.
HIRING MANAGER: ramp speed, pipeline, quota attainment, coachability.
EXECUTIVE LEADERSHIP: strategic impact, revenue growth, competitive position.
PEERS AND CROSS-FUNCTIONAL PARTNERS: collaboration, credibility, shared wins.
HR: culture fit, stability, decision safety.
End with NEXT CONVERSATION: who she should ask to be introduced to next, and the exact sentence to ask with.`,
  answers: `Write copy-ready answers to standard application form questions. Each answer under 90 words, under its heading in ALL CAPS:
WHY THIS COMPANY
WHY THIS ROLE
WHAT MAKES YOU A STRONG FIT
DESCRIBE A COMPLEX DEAL YOU LED (only from what her resume describes; if it describes none, write "[Add a deal from your experience]")
SALARY EXPECTATIONS (write "[Your number]" and one sentence anchoring on total compensation and OTE; never state a figure)
WORK AUTHORIZATION AND NOTICE PERIOD (write "[Fill in]")`,
};

const EFFORT: Record<KitPart, "medium" | "high"> = { resume: "high", letter: "high", pov: "high", committee: "medium", answers: "medium" };

const block = (label: string, v: string | null | undefined) => (v && v.trim() ? `${label}:\n${v.trim()}\n` : "");

/** The shared context every part is written from. Kept identical across parts so it can be cached. */
export function kitContext(i: KitInput) {
  return [
    `RESUME:\n${i.resumeText.trim()}\n`,
    `PROFILE FACTS (her own statements):\n${PROFILE.facts.map((f) => `- ${f}`).join("\n")}\n`,
    `JOB POSTING: ${i.job.title} at ${i.company.name}${i.job.location ? ` (${i.job.location})` : ""}`,
    block("Required qualifications", i.job.requiredQuals),
    block("Preferred qualifications", i.job.preferredQuals),
    block("Description", i.job.descriptionText?.slice(0, 30000)),
    `COMPANY (AI-compiled profile, not verified): ${i.company.name} · ${i.company.category}${i.company.maturity ? ` · ${i.company.maturity}` : ""}`,
    block("About", i.company.description),
    block("Products", i.company.keyProducts),
    block("Customers", i.company.customers),
    block("Buyers", i.company.buyerPersonas),
    block("Risks", i.company.risks),
    i.company.news.length ? `Recent developments:\n${i.company.news.map((n) => `- ${n}`).join("\n")}\n` : "",
    `POSITIONING NOTES (app guidance for this kind of company):\n${positioning(i.company.category, i.company.maturity).map((l) => `- ${l}`).join("\n")}`,
  ].filter(Boolean).join("\n");
}

async function writePart(client: Anthropic, part: KitPart, context: string) {
  const res = await client.beta.messages.create({
    model: MODEL, max_tokens: 16000, output_config: { effort: EFFORT[part] },
    system: [{ type: "text", text: SYSTEM }, { type: "text", text: context, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: TASK[part] }],
    // Server-side refusal fallback ("default" routing), as in the assistant.
    betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
  });
  if (res.stop_reason === "refusal") throw new Error(`The model declined to write the ${KIT_LABEL[part].toLowerCase()}.`);
  return res.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
}

export async function generateKit(input: KitInput): Promise<KitParts> {
  const client = new Anthropic();
  const context = kitContext(input);
  const written = await Promise.all(KIT_PARTS.map(async (p) => [p, await writePart(client, p, context)] as const));
  return Object.fromEntries(written) as KitParts;
}

// ---- Checks (no AI): her banned language, and figures that do not appear in the sources ----

const LANGUAGE: [RegExp, string][] = [
  [/\bpassionate\b/i, "Banned opener language: say what you will deliver instead"],
  [/\b(thrilled|excited|delighted) (to|about|by)\b/i, "Sounds eager rather than confident"],
  [/\b(grateful|honou?red|privileged|humbled)\b/i, "Sounds grateful for the opportunity instead of confident in the value"],
  [/\bthank you for (your )?(time|consideration|considering)\b/i, "Gratitude close: end with a next step instead"],
  [/\bopportunity to (join|be part of|contribute)\b/i, "Frames the job as a favour to you"],
  [/\b(I am|I'm) writing to\b/i, "Generic opener"],
  [/\bto whom it may concern\b/i, "Generic salutation"],
  [/\bresponsible for\b/i, "Lists a responsibility instead of a result"],
  [/\b(duties|responsibilities) (included|include)\b/i, "Lists responsibilities instead of results"],
  [/\b(results|detail|goal|data)[- ](driven|oriented)\b/i, "Generic resume language"],
  [/\b(team player|self-starter|go-getter|hard[- ]working|proven track record|think outside the box|synergy|wear many hats)\b/i, "Generic resume language"],
  [/\bI (believe|feel|think) I (would be|am|'d be) a (great|good|strong|perfect) fit\b/i, "A claim, not proof"],
];

/** Figures in generated text whose number does not appear anywhere in the sources. */
export function unsupportedFigures(text: string, sources: string) {
  const known = new Set((sources.match(/\d+(?:[.,]\d+)*/g) || []).map((n) => n.replace(/,/g, "")));
  const out: string[] = [];
  for (const m of text.matchAll(/\$?\d+(?:[.,]\d+)*(?:\s?(?:%|\+|[kKmMbB]\b|x\b|million\b|billion\b))?/g)) {
    const core = m[0].match(/\d+(?:[.,]\d+)*/)![0].replace(/,/g, "");
    const plain = m[0] === core;
    if (plain && core.length === 1) continue; // list numbering, "3 priorities"
    if (["30", "31", "60", "61", "90"].includes(core)) continue; // 30-60-90 day plan
    if (!known.has(core) && !out.includes(m[0].trim())) out.push(m[0].trim());
  }
  return out;
}

const sentences = (t: string) => t.replace(/\n-\s/g, "\n").split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);

export function checkKit(parts: Partial<KitParts>, src: { resumeText: string; contextText: string }): KitChecks {
  const herFacts = `${src.resumeText}\n${PROFILE.facts.join("\n")}`;
  const out = {} as KitChecks;
  for (const p of KIT_PARTS) {
    const text = parts[p] ?? "";
    const issues: KitIssue[] = [];
    for (const [re, detail] of LANGUAGE) {
      const m = text.match(re);
      if (m) issues.push({ kind: "language", text: m[0], detail });
    }
    // Resume and letter speak about her, so their figures must come from her resume or profile; other parts may quote the posting.
    const sources = p === "resume" || p === "letter" ? herFacts : `${herFacts}\n${src.contextText}`;
    for (const f of unsupportedFigures(text, sources)) issues.push({ kind: "figure", text: f, detail: p === "resume" || p === "letter" ? "Not in your resume or profile. Verify it or remove it." : "Not in your resume, profile, the posting or the company record. Verify it or remove it." });
    if (p !== "resume") {
      const max = p === "letter" ? 40 : 30; // her own letters run longer sentences than the notes
      const long = sentences(text).filter((s) => s.split(/\s+/).length > max);
      if (long.length) issues.push({ kind: "length", text: `${long.length} long sentence${long.length > 1 ? "s" : ""}`, detail: `Over ${max} words: “${long[0].slice(0, 80)}…”. Short sentences carry stakes.` });
    }
    if (p === "letter") {
      const words = text.split(/\s+/).filter(Boolean).length;
      if (words > 450) issues.push({ kind: "length", text: `${words} words`, detail: "Your letters run about 400 words; this one is longer." });
    }
    out[p] = issues;
  }
  return out;
}
