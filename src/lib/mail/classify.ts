// What a company's email means for her application. Rules only (no AI), so the same email always gets
// the same reading and every stage move can be explained by the phrase that triggered it.

export type EmailKind = "rejection" | "offer" | "interview" | "confirmation" | "reply";

/** Email services applicant tracking systems send from on the employer's behalf. */
export const ATS_DOMAINS = ["greenhouse.io", "greenhouse-mail.io", "lever.co", "ashbyhq.com", "ashby.io", "myworkday.com", "myworkdayjobs.com", "workday.com", "smartrecruiters.com", "smartrecruitersmail.com", "workablemail.com", "workable.com", "icims.com", "successfactors.com", "successfactors.eu", "oraclecloud.com", "taleo.net", "jobvite.com", "breezy.hr", "jazzhr.com", "rippling.com", "gem.com", "goodtime.io", "paradox.ai", "phenom.com", "eightfold.ai", "avature.net", "amazon.jobs"];
/** Personal mailbox providers: an address there says nothing about the employer. */
const FREEMAIL = ["gmail.com", "outlook.com", "hotmail.com", "live.com", "yahoo.com", "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com", "msn.com"];

const MULTI = /\.(co|com|org|net|ac|gov)\.[a-z]{2}$/;
/** "jobs.mail.databricks.com" → "databricks.com". */
export function baseDomain(hostOrUrl: string | null | undefined) {
  if (!hostOrUrl) return null;
  let h = hostOrUrl.trim().toLowerCase();
  try { if (/^[a-z]+:\/\//.test(h)) h = new URL(h).hostname; } catch { return null; }
  h = h.replace(/^www\./, "").split("/")[0].split(":")[0];
  if (!h.includes(".")) return null;
  const parts = h.split(".");
  return parts.slice(MULTI.test(h) ? -3 : -2).join(".");
}

export const isAtsDomain = (d: string | null) => !!d && ATS_DOMAINS.some((a) => d === a || d.endsWith(`.${a}`));
export const isFreemail = (d: string | null) => !!d && FREEMAIL.includes(d);
/** A system sender rather than a person she could write back to. */
export const isAutomated = (email: string) => /^(no-?reply|do-?not-?reply|donotreply|notifications?|mailer(-daemon)?|bounce|careers|jobs|recruiting|talent(acquisition)?|hr|apply|applications?|hiring|team|info|hello|support|system)([+._-].*)?@/i.test(email);

const RULES: [EmailKind, RegExp][] = [
  // Rejections first: they usually also thank her for applying.
  ["rejection", /\b(regret to (inform|let you know)|(not|won'?t|will not) be (moving|proceeding|progressing) (forward|further)|decided (not )?to (move|moving) forward with (other|another)|(move|moving) forward with (other|another) candidates?|pursue (other|another) candidates?|decided to (pursue|proceed with) (other|another)|position has (been|now been) filled|no longer (under consideration|being considered|considering your)|not (been )?selected|other candidates (whose|who)|not a match for|(will|have decided to) not (be )?(move|moving) your (application|candidacy))/i],
  ["rejection", /\bunfortunately\b[^.]{0,140}\b(not|other candidates?|another candidate|move forward|moving forward|pursue|filled|declin)/i],
  ["offer", /\b(offer letter|pleased to (extend|offer you)|extend (you )?an? (formal |verbal )?offer|formal offer|verbal offer|offer of employment|your offer (details|package))\b/i],
  ["interview", /\b(schedule (a|an|some|the) (time|call|interview|chat|conversation|meeting|screen)|interview (invitation|invite|request|with)|invite you to (an? |a virtual |our )?(interview|call|conversation|chat|onsite)|your availability|availability (for|to)|set up (a|an|some) (call|time|interview|chat)|book (a |some )?time|calendly\.com|goodtime\.io|cal\.com|next round|phone screen|recruiter screen|would (love|like) to (chat|connect|speak|talk|schedule)|next steps? in (the|our) (process|interview)|move (you )?forward (to|in|with) (the|our|an?) (next|interview)|times that work)\b/i],
  ["confirmation", /\b(thank(s| you) for (applying|your application|submitting)|received your application|application (has been |was )?(received|submitted)|we('ve| have) received your|successfully (applied|submitted)|your application (for|to) .{0,80} (is|has been) (received|submitted|under review))\b/i],
];

/** Mentions of her application or a conversation about a role, for telling a recruiter's reply from other company mail. */
const ABOUT_A_ROLE = /\b(application|applied|candidacy|position|role|opening|interview|resume|résumé|your background|your experience|opportunity|recruit|hiring|req\b)/i;

/** The kind of email, or null when it is nothing she needs to act on (newsletters, product mail, etc.). */
export function classify(subject: string, text: string, from: { email: string; isPersonAtCompany: boolean }): { kind: EmailKind; why: string } | null {
  const hay = `${subject}\n${text.slice(0, 6000)}`;
  for (const [kind, re] of RULES) {
    const m = hay.match(re);
    if (m) return { kind, why: m[0].replace(/\s+/g, " ").trim() };
  }
  if (from.isPersonAtCompany && !isAutomated(from.email) && ABOUT_A_ROLE.test(hay)) return { kind: "reply", why: "a person at the company wrote to you about the role" };
  return null;
}

/** How far along a stage is, for moving applications forward only. */
export const STAGE_RANK: Record<string, number> = { RESEARCHING: 0, PRIORITIZED: 1, RESUME_PREP: 2, READY_TO_APPLY: 3, APPLIED: 4, ON_HOLD: 4, RECRUITER_CONTACT: 5, HIRING_MANAGER: 6, INTERVIEWING: 7, FINAL_INTERVIEW: 8, OFFER: 9, ACCEPTED: 10, REJECTED: 11, WITHDRAWN: 11 };
const CLOSED = ["ACCEPTED", "REJECTED", "WITHDRAWN"];

/** The stage an email moves an application to, or null to leave it where it is. */
export function nextStage(kind: EmailKind, stage: string): string | null {
  if (CLOSED.includes(stage)) return null;
  const r = STAGE_RANK[stage] ?? 0;
  switch (kind) {
    case "rejection": return "REJECTED";
    case "offer": return r < 9 ? "OFFER" : null;
    case "interview": return r < 5 ? "RECRUITER_CONTACT" : r < 7 ? "INTERVIEWING" : null;
    case "reply": return r < 5 ? "RECRUITER_CONTACT" : null;
    case "confirmation": return r < 4 ? "APPLIED" : null;
  }
}

/** Does the email talk about this job title? Used when she has more than one application at the company. */
export function titleMatch(title: string, hay: string) {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const h = ` ${norm(hay)} `;
  const t = norm(title);
  if (t && h.includes(` ${t} `)) return 1;
  const words = t.split(" ").filter((w) => w.length > 3);
  if (!words.length) return 0;
  return words.filter((w) => h.includes(` ${w} `)).length / words.length;
}
