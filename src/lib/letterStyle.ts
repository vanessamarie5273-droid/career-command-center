// Vanessa's cover letters (Nov 3, 2026). After four rounds of generated letters she supplied her own two: one for public
// sector and government roles, one for commercial enterprise roles. Kits use them as written, filling in only the company
// and the position. Facts in them come from her resume.

export const LETTER_SIGNOFF = "Kindest regards,\nVanessa Morales";

export const LETTER_MAX_WORDS = 260;

// Her letter for public sector and government roles.
export const PUBLIC_SECTOR_LETTER = `Dear [Company] Hiring Team,

Over nine years at SAP, most recently in U.S. Public Services, I’ve worked with state and local government, education, healthcare, nonprofit, and pre-commercial life sciences R&D organizations. Across those segments, I’ve learned how mission-driven organizations buy: investments planned around fiscal-year budgets and grant funding, approved through boards and governing bodies, and purchased through competitive solicitations and cooperative contracts. I’d like to bring that experience to [Company] as [Position].

In that role, I drove new customer acquisition and strategic account expansion across Cloud ERP, Data & Analytics, Business AI, Integration, Finance, HCM, and Supply Chain.

My strength is translating complex technical priorities into financially compelling business cases. These help leaders justify modernization investments to their boards, budget authorities, and funders, and they support the requirements that shape a solicitation.

I’d welcome the chance to discuss how that experience could support [Company]’s growth.

${LETTER_SIGNOFF}`;

// Her letter for commercial enterprise roles.
export const COMMERCIAL_LETTER = `Dear [Company] Hiring Team,

Over nine years at SAP, most recently in U.S. Public Services, I’ve sold enterprise software into some of the most complex buying environments there are: healthcare, pre-commercial life sciences R&D, education, nonprofit, and state and local government. I’d like to bring that discipline to [Company] as [Position].

I focused on net-new logo acquisition and land-and-expand growth across Cloud ERP, Data & Analytics, Business AI, Integration, Finance, HCM, and Supply Chain. That meant multi-threading across buying committees, earning sponsorship from the CFO, CIO, and operations leaders, and taking deals through security review, procurement, and legal to signature.

My strength is building business cases that hold up under CFO scrutiny. I tie technical priorities to ROI, total cost of ownership, and operational impact, which makes it easy for executives to prioritize the investment and move the deal forward instead of defaulting to the status quo.

I’d welcome the chance to discuss how I can help [Company] build pipeline, win competitive deals, and grow strategic accounts.

${LETTER_SIGNOFF}`;

// The note she sends the hiring manager on LinkedIn once she has applied on the company site (Nov 12, 2026): one need from
// the posting, one result that proves she can meet it, and her full name so the recruiter can pull up the application.
export const NOTE_NAME = "[Name]";
export const NOTE_MAX_WORDS = 110;
export const HM_NOTE = `Hi ${NOTE_NAME}, I saw you’re looking for someone who can [one need]. [Industry or role] has been my specialty for [years]. I led [relevant work, with its number] at [company], and I’d love to hear more about what you’re looking for in this hire. I’ve already applied, so your recruiter can pull up my résumé under Vanessa Morales.`;

const PUBLIC_SECTOR = /\b(public sector|public services|government|gov(tech)?|sled|state (and|&) local|state, local|federal|municipal|civic|k-12|higher education)\b/i;

/** Public sector and government roles: a Government Technology company, or a public sector title, team or territory. */
export function isPublicSectorRole(job: { title: string; department?: string | null; territory?: string | null }, company: { category: string }) {
  return company.category === "Government Technology" || PUBLIC_SECTOR.test([job.title, job.department, job.territory].filter(Boolean).join(" "));
}

/** Her letter for one role: the public sector letter for public sector and government roles, the commercial one otherwise.
 *  Title suffixes like "- Public Sector" read as ", Public Sector". */
export function herLetter(job: { title: string; department?: string | null; territory?: string | null }, company: { name: string; category: string }) {
  const template = isPublicSectorRole(job, company) ? PUBLIC_SECTOR_LETTER : COMMERCIAL_LETTER;
  const title = job.title.replace(/\s+[-–—|]\s+/g, ", ").trim();
  return template.replaceAll("[Company]", company.name).replaceAll("[Position]", title);
}

/** The body paragraphs of a letter: everything between the greeting and the sign-off. */
export function letterBody(text: string) {
  return text.split(/\n\s*\n/).map((x) => x.trim()).filter((x) => x && !/^Dear\b/.test(x) && !/^Kindest Regards/i.test(x));
}
