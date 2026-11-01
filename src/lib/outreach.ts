// Follow-up emails after she applies, saved as Outlook drafts: the note to the hiring manager (day 2) and
// the recruiter follow-up (day 5). When nobody is named on the posting, the plan says who to send it to.
import Anthropic from "@anthropic-ai/sdk";
import type { PrismaClient } from "@prisma/client";
import { SYSTEM, BRIEF, checkKit, writeOver } from "./kit";
import { loadInterview } from "./interview";
import { isAutomated } from "./mail/classify";

export type OutreachKind = "hiring_manager" | "recruiter";
export const OUTREACH_LABEL: Record<OutreachKind, string> = { hiring_manager: "Hiring manager note", recruiter: "Recruiter follow-up" };

export type Recipient = { name: string | null; email: string | null; linkedinUrl: string | null; source: string; replyToId: string | null };
const SALES_LEADER = /\b(sales|revenue|cro|business development|go[- ]to[- ]market|gtm|commercial|account(s)? executive|field|enterprise|partnerships?)\b/i;
const li = (q: string) => `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(q)}`;

/** Who each follow-up goes to, best evidence first, and where to look when the posting names nobody. */
export async function outreachPlan(db: PrismaClient, applicationId: string) {
  const a = await db.application.findUniqueOrThrow({ where: { id: applicationId }, include: { company: { include: { leaders: true, contacts: true } } } });
  const emails = await db.emailEvent.findMany({ where: { applicationId }, orderBy: { receivedAt: "desc" } });
  const person = emails.find((e) => !isAutomated(e.fromEmail) && e.fromName);
  const contacts = a.company.contacts;
  const byRole = (r: string) => contacts.find((c) => c.role === r && (c.email || c.linkedinUrl));
  const asRecipient = (c: (typeof contacts)[number], source: string): Recipient => ({ name: `${c.firstName} ${c.lastName ?? ""}`.trim(), email: c.email, linkedinUrl: c.linkedinUrl, source, replyToId: null });

  const recruiterContact = byRole("recruiter");
  const recruiter: Recipient | null = person
    ? { name: person.fromName, email: person.fromEmail, linkedinUrl: null, source: `wrote to you ${person.receivedAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, so the draft replies in that thread`, replyToId: person.providerId }
    : recruiterContact ? asRecipient(recruiterContact, "your recruiter contact at this company")
    : a.recruiterName ? { name: a.recruiterName, email: null, linkedinUrl: null, source: "recruiter named on this application (no email on file)", replyToId: null } : null;

  const hmContact = byRole("hiring_manager");
  const hiringManager: Recipient | null = hmContact ? asRecipient(hmContact, "hiring manager in your contacts")
    : a.hiringManagerName ? { name: a.hiringManagerName, email: null, linkedinUrl: null, source: "hiring manager named on this application (no email on file)", replyToId: null } : null;

  // No one named: the company's recorded sales leaders, her own connections there, and targeted LinkedIn searches.
  const leaders = a.company.leaders.filter((l) => SALES_LEADER.test(l.title)).slice(0, 4).map((l) => ({ name: l.name, title: l.title, linkedinUrl: l.linkedinUrl, factType: l.factType }));
  const connections = contacts.filter((c) => c.source === "linkedin_export").slice(0, 5).map((c) => ({ name: `${c.firstName} ${c.lastName ?? ""}`.trim(), title: c.title, linkedinUrl: c.linkedinUrl }));
  const segment = /\b(public sector|government|federal|state|healthcare|financial services|west|southwest|central|enterprise|mid-?market|strategic|commercial)\b/i.exec(a.title)?.[0];
  const searches = [
    { label: `${segment ? `${segment} ` : ""}sales leaders`, url: li(`${segment ? `${segment} ` : ""}sales director ${a.company.name}`) },
    { label: "VP / Head of Sales", url: li(`VP Sales ${a.company.name}`) },
    { label: "Sales recruiters", url: li(`technical recruiter sales ${a.company.name}`) },
  ];
  return { app: a, recruiter, hiringManager, leaders, connections, searches };
}

const TASK: Record<OutreachKind, (name: string | null) => string> = {
  hiring_manager: (name) => `Write the note she sends the hiring manager this week, after applying. It is how she gets in front of the decision maker instead of waiting in the applicant queue.
- Under 150 words. Greet ${name ? `"Hi ${name.split(" ")[0]},"` : `"Hi [Name]," (no name is known yet, she fills it in)`}.
- Open with one specific observation about their business, market or sales motion, taken from her POINT OF VIEW when it is given, phrased as an inference.
- One or two sentences on why she is built for it, with a fact from her resume.
- Offer her 30-60-90 plan and a short point of view on their go-to-market, and ask for 20 minutes in the next two weeks.
- Mention that she applied for the role, in one clause, not as the lead.
Start with "Subject:" on its own line (a subject that names their problem, not "Application for..."). Sign "Kindest Regards," and "Vanessa Morales".
After the email, write a line "---LINKEDIN---" and then a LinkedIn connection note to the same person, under 280 characters, same point, no greeting placeholder.`,
  recruiter: (name) => `Write her follow-up to the recruiter, five days after she applied with no answer yet.
- Under 110 words. Greet ${name ? `"Hi ${name.split(" ")[0]},"` : `"Hi [Name]," (no recruiter is known yet, she fills it in)`}.
- Name the role, then the one business problem from the posting she solves, and one proof line from her resume.
- Make advancing her easy: say she can talk this week, and ask directly about timing and who the hiring manager is.
- Confident, warm, no apology for following up and no gratitude-heavy opener.
Start with "Subject:" on its own line. Sign "Kindest Regards," and "Vanessa Morales".
After the email, write a line "---LINKEDIN---" and then a LinkedIn message to the recruiter, under 280 characters.`,
};

export function splitOutreach(text: string, fallbackSubject: string) {
  const [mail, linkedin = ""] = text.split(/\n-{3}LINKEDIN-{3}\n?/i);
  const m = mail.match(/^\s*Subject:\s*(.+)\r?\n+/i);
  return { subject: m ? m[1].trim() : fallbackSubject, body: (m ? mail.slice(m[0].length) : mail).trim(), linkedin: linkedin.trim() };
}

export async function writeOutreach(applicationId: string, kind: OutreachKind, name: string | null) {
  const { context, resumeText, title, app } = await loadInterview(applicationId);
  const text = await writeOver(new Anthropic(), SYSTEM, context, [{ role: "user", content: `${TASK[kind](name)}\n\nHer standard:\n${BRIEF}` }], "medium", OUTREACH_LABEL[kind].toLowerCase());
  const out = splitOutreach(text, kind === "recruiter" ? `${title}: following up` : `${app.company.name}: a point of view for the ${title} role`);
  const issues = checkKit({ pov: `${out.body}\n${out.linkedin}` }, { resumeText, contextText: context }).pov.filter((i) => i.kind !== "length");
  return { ...out, issues };
}
