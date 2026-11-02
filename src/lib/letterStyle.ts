// Vanessa's cover letters (Nov 2, 2026). She sent two letters she wrote herself as the model: one for a Sales Development
// Manager role, one for an Enterprise AE role. Kit letters follow their shape, tone and length, written fresh for each role.

export const LETTER_GREETING = "Dear [Company Name] Hiring Team,";
export const LETTER_SIGNOFF = "Kindest regards,\nVanessa Morales";

// Her two proof stories, in her words. A letter may use one nearly word for word when it fits the role.
export const LETTER_ACCOMPLISHMENTS = {
  "Customer recovery and expansion": "Most recently, I led the recovery of a strategic account at significant risk of churn. I brought technical experts, partners, and executive leadership together to resolve implementation challenges, restore customer confidence, and establish a path to go-live. The effort drove a $1.58M licensing expansion.",
  "Building a sales motion (GTM, sales development, leadership)": "During my nine years at SAP, I collaborated with global leadership to establish the North America Digital Hub, expanding sales development into active co-selling with Account Executives. Our team generated $80.6M in pipeline and $15.6M in closed revenue, increasing pipeline creation by 25% and conversion to closed revenue by 30%.",
};

// The paragraphs of her letters, in order. Each does a different job.
export const LETTER_GUIDE = [
  { name: "Why this role", purpose: "What the role achieves for the company and why that draws her", change: "Name the role. One specific thing about the company's business or the role's mandate, then the contribution she sees for herself" },
  { name: "SAP proof", purpose: "Her most relevant experience, with numbers", change: "Opens \"During my nine years at SAP,\" and leads with what this role needs most: the Digital Hub for team and sales development roles, full-cycle selling for AE roles" },
  { name: "How I work", purpose: "The methods behind the results", change: "Concrete practices that match the posting: qualification, buying committees, executive sponsorship, partners, procurement, Mutual Action Plans, coaching" },
  { name: "Proof story (when it fits)", purpose: "One result that shows she delivers", change: "The account recovery story or the Digital Hub story, whichever was not already used" },
  { name: "At [Company], I would", purpose: "Show she has already started doing the job", change: "Specific operating behaviors in this role: what she would focus on, coach, inspect or build, in their terms" },
  { name: "Close", purpose: "Tie her discipline to their next stage", change: "One or two sentences: the goal she would drive, then \"I would welcome the opportunity to bring that ... to ...\"" },
];

export const LETTER_PRINCIPLE = "Specific to this role and company in every paragraph. Her SAP experience is the proof, chosen and framed for what this role needs, never a career summary.";

export const LETTER_MAX_WORDS = 450;

// Her own letters, the model for tone, structure and length. The quota figure in her Chainguard letter is left out:
// it is not on her resume, and kit letters may only use resume facts.
export const LETTER_EXAMPLES = [
  `Dear Anthropic Hiring Team,

The Sales Development Manager, Enterprise role offers the opportunity to build the strategic customer relationships that support adoption while developing the next generation of sales executives. I am drawn to leading a team whose impact is visible in both revenue growth and career advancement.

During my nine years at SAP, I collaborated with global leadership to establish the North America Digital Hub, expanding sales development into active co-selling with Account Executives. Our team generated $80.6M in pipeline and $15.6M in closed revenue, increasing pipeline creation by 25% and conversion to closed revenue by 30%.

I built sales development strategies around market opportunity, customer fit, and buying signals. I recruited and coached professionals to research accounts, map stakeholders, and coordinate multi-threaded outreach with Account Executives. Having owned full sales cycles myself, I bring firsthand understanding of how executive priorities, procurement, legal, and security requirements shape a buying decision.

At Anthropic, I would coach BDRs to take ownership of the preparation enterprise selling requires, coming to Account Executive discussions with completed account research, stakeholder insights, and a proposed outreach strategy. I would expect them to contribute informed recommendations and follow through on agreed priorities without waiting for direction at every step.

Pipeline reviews would examine evidence of account progression: who we have engaged, whether a champion has influence, what business need creates urgency, and whether the customer has committed to a next step. Conversion patterns and disqualification reasons would help me identify whether to adjust targeting, sharpen discovery, or broaden stakeholder engagement.

My goal is to instill the discipline that prepares BDRs to think like Account Executives, pressure-test qualification against real business needs, and generate opportunities that convert to revenue for Anthropic.

${LETTER_SIGNOFF}`,
  `Dear Chainguard Hiring Team,

I am interested in the Enterprise Account Executive role because Chainguard connects two executive priorities: accelerating software delivery and reducing security risk. I see an opportunity to bring my experience translating complex technology into a compelling business case to help Chainguard win new customers and expand strategic accounts.

During my nine years at SAP, I owned full sales cycles across new customer acquisition and account expansion. I self-sourced opportunities, mapped buying committees, and built executive sponsorship by connecting technical requirements to financial and operational priorities. My approach is to establish why a customer needs to act, who must support the decision, and what evidence will justify the investment.

I partnered with solution engineers, resellers, and implementation teams to advance evaluations, align stakeholders on success criteria, and navigate procurement and contract negotiations. Disciplined qualification and Mutual Action Plans kept ownership, decision milestones, and risks visible throughout the sales cycle.

Most recently, I led the recovery of a strategic account at significant risk of churn. I brought technical experts, partners, and executive leadership together to resolve implementation challenges, restore customer confidence, and establish a path to go-live. The effort drove a $1.58M licensing expansion.

At Chainguard, I would focus on developing champions across engineering and security, earning executive commitment, and connecting technical validation to a funded buying decision. I would welcome the opportunity to bring that account discipline to your next stage of growth.

${LETTER_SIGNOFF}`,
];

/** The body paragraphs of a letter: everything between the greeting and the sign-off. */
export function letterBody(text: string) {
  return text.split(/\n\s*\n/).map((x) => x.trim()).filter((x) => x && !/^Dear\b/.test(x) && !/^Kindest Regards/i.test(x));
}
