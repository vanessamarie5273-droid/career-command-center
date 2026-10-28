// Vanessa's cover letter template (Oct 28, 2026). Kit letters fill it in, following LETTER_GUIDE for what each paragraph does.
export const LETTER_TEMPLATE = `Dear [Company Name] Hiring Team,

I am interested in the [Position Title] because it offers the opportunity to [specific aspect of the role that interests you]. What particularly attracts me to [Company Name] is [unique capability, market opportunity, or competitive advantage]. I see an opportunity to leverage my experience to [specific contribution aligned with the company's objectives].

Throughout my nine years at SAP, I have worked across new customer acquisition, strategic account expansion, and sales leadership, earning SAP Winners Circle in 2025. My experience spans Cloud ERP, Finance, HCM, Procurement, Supply Chain, Data & Analytics, and Business AI. I've built lasting relationships with C-level executives by advising them on technology investments aligned with their strategic objectives and navigating complex, multi-stakeholder sales cycles.

[Include a relevant accomplishment based on the position.]

I would welcome the opportunity to bring my [two or three qualifications most relevant to the position] to [Company Name] and contribute to [specific business objective or growth opportunity].

Kindest Regards,
Vanessa Morales`;

// Her two accomplishment paragraphs. The letter uses the one that fits the role best.
export const LETTER_ACCOMPLISHMENTS = {
  "Customer expansion (account, renewal, expansion or customer-success roles)": "Most recently, I led the recovery of a strategic customer account at significant risk of churn. I aligned technical experts, implementation partners, and executive leadership to resolve critical implementation challenges, restore customer confidence, and establish a path to go-live. The effort also drove a $1.58M licensing expansion.",
  "Sales leadership / GTM (leadership, new-motion, sales development or go-to-market roles)": "I collaborated with global leadership to establish SAP's North America Digital Hub, developing a model that moved sales development beyond prospecting into active co-selling with Account Executives. Our team generated $80.6M in pipeline and $15.6M in closed revenue, increasing pipeline creation by 25% and conversion to closed revenue by 30%.",
};

// Her guide to the four body paragraphs. Each paragraph does a different job.
export const LETTER_GUIDE = [
  { name: "Why the company", purpose: "Establish genuine interest and business understanding", change: "Role, company differentiation, market opportunity" },
  { name: "Why I'm qualified", purpose: "Establish credibility and technical breadth", change: "Emphasize the experience most relevant to the role" },
  { name: "Proof of impact", purpose: "Demonstrate results rather than simply stating capabilities", change: "Select the customer recovery or GTM leadership accomplishment" },
  { name: "Closing", purpose: "Connect my experience to the company's priorities", change: "Two relevant strengths and the contribution I would make" },
];

export const LETTER_PRINCIPLE = "Each paragraph should do something different. The opening establishes why I want the position, the second establishes my qualifications, the third proves my ability to deliver results, and the closing connects my experience to the company's needs.";

/** The body paragraphs of a letter: everything between the greeting and the sign-off. */
export function letterBody(text: string) {
  return text.split(/\n\s*\n/).map((x) => x.trim()).filter((x) => x && !/^Dear\b/.test(x) && !/^Kindest Regards/i.test(x));
}
