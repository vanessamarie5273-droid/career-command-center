// Vanessa's cover letters (Nov 2, 2026, third pass). Letters that restated her resume, then letters that restated the posting,
// both had "no value". A letter now leads with her point of view on the company's problem and uses one or two proof points.

export const LETTER_GREETING = "Dear [Company Name] Hiring Team,";
export const LETTER_SIGNOFF = "Kindest regards,\nVanessa Morales";

// Her two proof stories, in her words. A letter may draw one result from them when it supports the point of view.
export const LETTER_ACCOMPLISHMENTS = {
  "Customer recovery and expansion": "Most recently, I led the recovery of a strategic account at significant risk of churn. I brought technical experts, partners, and executive leadership together to resolve implementation challenges, restore customer confidence, and establish a path to go-live. The effort drove a $1.58M licensing expansion.",
  "Building a sales motion (GTM, sales development, leadership)": "During my nine years at SAP, I collaborated with global leadership to establish the North America Digital Hub, expanding sales development into active co-selling with Account Executives. Our team generated $80.6M in pipeline and $15.6M in closed revenue, increasing pipeline creation by 25% and conversion to closed revenue by 30%.",
};

// Four short paragraphs. The letter's value is her point of view, not a summary of the posting or her resume.
export const LETTER_GUIDE = [
  { name: "Point of view", purpose: "Her read of the problem behind this role that the posting does not spell out", change: "The buyer's real pain, who actually buys, the competitive or market pressure, or where deals in this space are won and lost. Specific to this company and segment, stated with confidence" },
  { name: "Why me", purpose: "Why she in particular can solve it", change: "The one angle from her experience that connects to that point of view (for example, she sold the incumbent systems, sold to that buyer, or built that motion), backed by one or two results from her resume" },
  { name: "First move", purpose: "Show she has already started doing the job", change: "The one concrete thing she would do first in this role, following from the point of view. One move, not a list" },
  { name: "Close", purpose: "Create the next conversation", change: "One sentence inviting a conversation about their specific situation" },
];

export const LETTER_PRINCIPLE = "The reader already knows the job description and can read her resume. Every sentence has to tell them something they don't have yet: her view of their business, why her experience fits that view, and what she would do.";

export const LETTER_MAX_WORDS = 260;

// The model letter (Nov 2, 2026): the kit's Anaplan letter, which she rejected as "no value", rewritten around a point of view.
// Her earlier Anthropic and Chainguard letters set the voice: complete, professional sentences and "I would welcome...".
export const LETTER_EXAMPLES = [
  `Dear Anaplan Hiring Team,

Consumer brands rarely miss a quarter for lack of data. They miss it because Finance, Supply Chain, and HR are each planning against a different number, and no one owns the gap until margin is gone. That gap is Anaplan's opening in a consumer enterprise territory, and it is sold to the CFO, not to the planning team.

I know that conversation from the other side of the table. For nine years at SAP, I sold Cloud ERP, HCM, and Supply Chain, the systems your platform has to connect. I know where the ERP planning story breaks and how a CFO weighs the alternative. I won those deals by building the business case from the customer's own financials and securing C-suite sponsorship early, which closed $8.5M in new and expansion revenue and earned Winners Circle 2025.

In your territory, I would open every account with one question for the CFO: where did disconnected plans cost you margin last year? The answer becomes the business case, and the business case brings Finance, Supply Chain, and HR to the same table. Existing customers get the same question before their next planning cycle, well ahead of renewal.

I would welcome a conversation about where your consumer accounts stand today.

${LETTER_SIGNOFF}`,
];

/** The body paragraphs of a letter: everything between the greeting and the sign-off. */
export function letterBody(text: string) {
  return text.split(/\n\s*\n/).map((x) => x.trim()).filter((x) => x && !/^Dear\b/.test(x) && !/^Kindest Regards/i.test(x));
}
