// Application Kit: per-job tailored resume, Why Me letter, point of view, buying-committee notes and form answers.
// Generated text may only use facts from her resume and stated profile; checkKit() flags anything that slips through.
import Anthropic from "@anthropic-ai/sdk";
import { MODEL } from "./assistant";
import { positioning } from "./positioning";
import { LETTER_ACCOMPLISHMENTS, LETTER_EXAMPLES, LETTER_GUIDE, LETTER_MAX_WORDS, LETTER_PRINCIPLE, LETTER_SIGNOFF, letterBody } from "./letterStyle";
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
  job: { title: string; location: string | null; descriptionText: string | null; requiredQuals: string | null; preferredQuals: string | null;
    department?: string | null; seniority?: string | null; territory?: string | null };
  company: { name: string; category: string; maturity: string | null; description: string | null; keyProducts: string | null; customers: string | null; buyerPersonas: string | null; risks: string | null; news: string[];
    subCategory?: string | null; headquarters?: string | null; growthThesis?: string | null; engagementStrategy?: string | null; cultureNotes?: string | null;
    revenue?: string | null; revenueGrowth?: string | null; fundingSummary?: string | null; notes?: string | null };
};

/** Words of job description on file: the posting text, or the qualifications when that is all there is. */
export function postingWords(job: KitInput["job"]) {
  const text = [job.descriptionText, job.descriptionText ? null : job.requiredQuals, job.descriptionText ? null : job.preferredQuals].filter(Boolean).join(" ");
  return text.split(/\s+/).filter(Boolean).length;
}
export const THIN_POSTING = 120;

export const SYSTEM = `You write job-search material for Vanessa, a senior enterprise sales executive.

FACT RULES (absolute):
- Anything about her (employers, titles, dates, numbers, scope, credentials, achievements) must come from RESUME. Never invent, round up or combine figures. If a requirement is not evidenced, do not claim it.
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
  letter: `Write her cover letter for this role. ${LETTER_PRINCIPLE}

FIRST, WORK OUT (silently; do not output this):
- The real problem behind this role that the posting does not say outright: what the buyer struggles with, who actually signs, what the company competes against (often the status quo or an incumbent system), or where deals in this segment stall. Use COMPANY, recent developments, the segment and the buyers. This is her point of view; make it sharp and specific to this company.
- The one angle in RESUME that makes her the person to solve that problem: for example, she sold the incumbent systems this company competes with or connects to, she sells to that buyer, she sells in that sector, or she built that kind of motion.
- One or two results from RESUME that prove that angle. No more.
- The one first move she would make in this role that follows from her point of view.

THEN WRITE, in exactly this shape:
Dear <company name> Hiring Team,

Four short paragraphs:
${LETTER_GUIDE.map((g, i) => `${i + 1}. ${g.name.toUpperCase()}: ${g.purpose}. ${g.change}.`).join("\n")}

${LETTER_SIGNOFF}

RULES:
- She is competing in a saturated market against many qualified sellers. Write with the authority of a recognized expert in this space: the point of view should be an insight only a seasoned seller who has worked these buyers would have, stated plainly and without hedging. Nothing a generic candidate could also write.
- 170 to 230 words between greeting and sign-off. Executive register: an expert talking to a peer.
- Never repeat the posting back. Do not restate the role's duties, requirements, territory description or company tagline, and do not copy phrases from JOB POSTING. The reader wrote it.
- Never summarize her career. Leave out anything that does not serve the point of view: other roles, awards, tools, and stories that do not fit. At most two figures in the whole letter, only from RESUME.
- Do not open with "I am interested in" or with her; open with the point of view.
- The point of view is her read, so state it with confidence but never invent company facts, figures, customers or people.
- Never "passionate", "excited", "thrilled", "grateful", "proven track record", "results-driven" or "I believe I would be a great fit".

HER PROOF STORIES (one result from one of these may support the point of view; never paste a story whole):
${Object.entries(LETTER_ACCOMPLISHMENTS).map(([k, v]) => `${k}:\n${v}`).join("\n\n")}

HER MODEL LETTER (match its shape, voice and length; its company and argument are not this one's):
${LETTER_EXAMPLES.map((e) => `<example>\n${e}\n</example>`).join("\n\n")}

Output only the finished letter.`,
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
  const c = i.company, j = i.job;
  const words = postingWords(j);
  return [
    `JOB POSTING: ${j.title} at ${c.name}${j.location ? ` (${j.location})` : ""}`,
    [j.department && `Team: ${j.department}`, j.seniority && `Level: ${j.seniority}`, j.territory && `Territory: ${j.territory}`].filter(Boolean).join(" · "),
    words < THIN_POSTING ? `NOTE: only ${words} words of the job description are on file. Do not invent requirements the posting does not state.\n` : "",
    block("Required qualifications", j.requiredQuals),
    block("Preferred qualifications", j.preferredQuals),
    block("Description", j.descriptionText?.slice(0, 30000)),
    `COMPANY (AI-compiled profile, not verified): ${c.name} · ${c.category}${c.subCategory ? ` · ${c.subCategory}` : ""}${c.maturity ? ` · ${c.maturity}` : ""}${c.headquarters ? ` · ${c.headquarters}` : ""}`,
    block("About", c.description),
    block("Products", c.keyProducts),
    block("Customers", c.customers),
    block("Buyers", c.buyerPersonas),
    block("Growth thesis", c.growthThesis),
    [c.revenue && `Revenue: ${c.revenue}`, c.revenueGrowth && `Growth: ${c.revenueGrowth}`, c.fundingSummary && `Funding: ${c.fundingSummary}`].filter(Boolean).join(" · "),
    block("Risks", c.risks),
    block("Culture", c.cultureNotes),
    c.news.length ? `Recent developments:\n${c.news.map((n) => `- ${n}`).join("\n")}\n` : "",
    block("Account strategy (her plan for this company)", c.engagementStrategy),
    block("Her notes on this company", c.notes),
    `POSITIONING NOTES (app guidance for this kind of company):\n${positioning(c.category, c.maturity).map((l) => `- ${l}`).join("\n")}\n`,
    `RESUME (the only source of facts about her):\n${i.resumeText.trim()}`,
  ].filter(Boolean).join("\n");
}

/** One Claude call: a fixed instruction block, then the shared context (cached), then the conversation. */
export async function writeOver(client: Anthropic, instructions: string, context: string, messages: Anthropic.Beta.BetaMessageParam[], effort: "low" | "medium" | "high", what: string) {
  const res = await client.beta.messages.create({
    model: MODEL, max_tokens: 16000, output_config: { effort },
    system: [{ type: "text", text: instructions }, { type: "text", text: context, cache_control: { type: "ephemeral" } }],
    messages,
    // Server-side refusal fallback ("default" routing), as in the assistant.
    betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
  });
  if (res.stop_reason === "refusal") throw new Error(`The model declined to write the ${what}.`);
  return res.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
}

const writePart = (client: Anthropic, part: KitPart, context: string) => writeOver(client, SYSTEM, context, [{ role: "user", content: TASK[part] }], EFFORT[part], KIT_LABEL[part].toLowerCase());

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

const words = (t: string) => t.toLowerCase().replace(/[^a-z0-9$%.\s]/g, " ").split(/\s+/).filter(Boolean);

/** The first run of `n` or more words the text copies straight from a source (her resume, the posting), if any. */
export function copiedFrom(text: string, source: string, n: number) {
  const r = words(source);
  const grams = new Set<string>();
  for (let i = 0; i + n <= r.length; i++) grams.add(r.slice(i, i + n).join(" "));
  const t = words(text);
  for (let i = 0; i + n <= t.length; i++) if (grams.has(t.slice(i, i + n).join(" "))) return t.slice(i, i + n).join(" ");
  return null;
}

export function checkKit(parts: Partial<KitParts>, src: { resumeText: string; contextText: string; input?: KitInput }): KitChecks {
  const herFacts = src.resumeText;
  const out = {} as KitChecks;
  for (const p of KIT_PARTS) {
    const text = parts[p] ?? "";
    const issues: KitIssue[] = [];
    for (const [re, detail] of LANGUAGE) {
      const m = text.match(re);
      if (m) issues.push({ kind: "language", text: m[0], detail });
    }
    // Resume and letter speak about her, so their figures must come from her resume; other parts may quote the posting.
    const sources = p === "resume" || p === "letter" ? herFacts : `${herFacts}\n${src.contextText}`;
    for (const f of unsupportedFigures(text, sources)) issues.push({ kind: "figure", text: f, detail: p === "resume" || p === "letter" ? "Not in your resume. Verify it or remove it." : "Not in your resume, the posting or the company record. Verify it or remove it." });
    if (p !== "resume") {
      const max = p === "letter" ? 35 : 30;
      const long = sentences(text).filter((s) => s.split(/\s+/).length > max);
      if (long.length) issues.push({ kind: "length", text: `${long.length} long sentence${long.length > 1 ? "s" : ""}`, detail: `Over ${max} words: “${long[0].slice(0, 80)}…”. Short sentences carry stakes.` });
    }
    if (p === "letter" && /\[[^\]]+\]/.test(text)) issues.push({ kind: "language", text: text.match(/\[[^\]]+\]/)![0], detail: "A template placeholder was left in. Fill it in before sending." });
    if (p === "letter" && text) {
      const body = letterBody(text);
      if (body.length < 3 || body.length > 5) issues.push({ kind: "structure", text: `${body.length} paragraphs`, detail: `The letter uses four short paragraphs: ${LETTER_GUIDE.map((g) => g.name.toLowerCase()).join(", ")}.` });
      if (/^(I am|I'm) (very |really )?interested in\b/i.test(body[0] ?? "")) issues.push({ kind: "structure", text: "Opens with interest", detail: "Open with your point of view on their business, not with your interest in the role." });
      const name = src.input?.company.name;
      if (name && !text.toLowerCase().includes(name.split(/[\s,]+/)[0].toLowerCase())) issues.push({ kind: "structure", text: "Company not named", detail: `The letter never mentions ${name}. It should read as written for them only.` });
      const posting = src.input ? [src.input.job.descriptionText, src.input.job.requiredQuals, src.input.job.preferredQuals].filter(Boolean).join("\n") : "";
      const echoed = posting ? copiedFrom(body.join("\n"), posting, 7) : null;
      if (echoed) issues.push({ kind: "structure", text: "Repeats the posting", detail: `“${echoed}…” comes straight from the job description. They wrote it; tell them something they don't know.` });
      const copied = copiedFrom(body.join("\n"), herFacts, 10);
      if (copied) issues.push({ kind: "structure", text: "Copies your resume", detail: `“${copied}…” is a resume line pasted in. Say what it proves for this role instead.` });
      const figures = new Set(text.match(/\$\d+(?:\.\d+)?\s?[MKB]?|\d+(?:\.\d+)?%/gi) ?? []);
      if (figures.size > 2) issues.push({ kind: "structure", text: `${figures.size} figures`, detail: "Use one or two proof points that back your point of view, not a list of results." });
      const count = text.split(/\s+/).filter(Boolean).length;
      if (count > LETTER_MAX_WORDS) issues.push({ kind: "length", text: `${count} words`, detail: `Executives skim. Keep it under ${LETTER_MAX_WORDS}.` });
      if (src.input && postingWords(src.input.job) < THIN_POSTING) issues.push({ kind: "source", text: "No job description", detail: "The app has little or none of this posting's description, so the letter can't tie to the role. Rebuild the kit once the description shows on the job page." });
    }
    out[p] = issues;
  }
  return out;
}

// ---- Suggested fixes: one flagged issue at a time, as a find-and-replace she can apply ----

export type KitFix = { find: string; replace: string; why: string };

/** Asks Claude for the smallest change that clears one flagged issue, under the same fact rules as the kit. */
export async function suggestFix(input: KitInput, part: KitPart, text: string, issue: KitIssue): Promise<KitFix> {
  const ask = `Below is the current ${KIT_LABEL[part].toLowerCase()} between <current> tags. The app's check flagged one issue in it:
[${issue.kind}] ${issue.text}: ${issue.detail}

Fix only that issue. Change as little as possible and keep everything else word for word. Follow the fact rules and the original task below.
- A figure not in her resume: rewrite the sentence without it, or with the figure RESUME actually gives.
- Banned or weak language: rewrite the sentence in her direct, confident voice.
- A missing paragraph or opening: write it the way the task says, and replace the paragraph it belongs in.

Reply with JSON only, no other text: {"find": "<text copied exactly from the current document that should change: a whole sentence or paragraph>", "replace": "<the new text>", "why": "<one short sentence on what changed>"}

ORIGINAL TASK:
${TASK[part]}

<current>
${text}
</current>`;
  const out = await writeOver(new Anthropic(), SYSTEM, kitContext(input), [{ role: "user", content: ask }], "medium", "suggested fix");
  const json = out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1);
  let fix: KitFix;
  try { fix = JSON.parse(json); } catch { throw new Error("The suggestion came back in the wrong shape. Try again."); }
  if (typeof fix.find !== "string" || typeof fix.replace !== "string" || !text.includes(fix.find)) throw new Error("The suggestion did not match the current text. Try again.");
  return { find: fix.find, replace: fix.replace, why: String(fix.why ?? "") };
}
