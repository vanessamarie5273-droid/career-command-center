// Vanessa's Why Me letter (reworked Nov 2, 2026). The Oct 28 template kept a fixed SAP paragraph and pasted one of two
// accomplishments word for word, so every letter restated her resume. Now each letter starts from the company's problem and
// the posting's requirements, and uses her resume only as proof against them. Greeting and sign-off stay hers.

export const LETTER_GREETING = "Dear [Company Name] Hiring Team,";
export const LETTER_SIGNOFF = "Kindest Regards,\nVanessa Morales";

// Her two strongest proof stories, in her words. The letter may draw on either when it maps to a requirement; never pasted whole.
export const LETTER_ACCOMPLISHMENTS = {
  "Customer recovery and expansion": "Most recently, I led the recovery of a strategic customer account at significant risk of churn. I aligned technical experts, implementation partners, and executive leadership to resolve critical implementation challenges, restore customer confidence, and establish a path to go-live. The effort also drove a $1.58M licensing expansion.",
  "Building a sales motion (GTM, sales development, leadership)": "I collaborated with global leadership to establish SAP's North America Digital Hub, developing a model that moved sales development beyond prospecting into active co-selling with Account Executives. Our team generated $80.6M in pipeline and $15.6M in closed revenue, increasing pipeline creation by 25% and conversion to closed revenue by 30%.",
};

// The four body paragraphs. Each answers one question an executive reader has.
export const LETTER_GUIDE = [
  { name: "What you need", purpose: "Show she understands their business problem better than other candidates", change: "The problem this role exists to solve, in the posting's terms, plus one specific fact about the company" },
  { name: "Why I'm built for it", purpose: "Prove fit against their requirements, not restate her resume", change: "Two or three of the posting's top requirements, each answered with one result that has a number" },
  { name: "Why now", purpose: "Make the cost of waiting or a safe hire real", change: "A timing signal from the posting or company, and what she shortens or de-risks" },
  { name: "Next step", purpose: "Create the next conversation", change: "A concrete thing she brings (a 30-60-90 plan or an account view for their territory) and a direct ask" },
];

export const LETTER_PRINCIPLE = "Written for an executive who skims. Every paragraph is about their business first and her second. Her resume is evidence, not the story.";

export const LETTER_MAX_WORDS = 300;

/** The body paragraphs of a letter: everything between the greeting and the sign-off. */
export function letterBody(text: string) {
  return text.split(/\n\s*\n/).map((x) => x.trim()).filter((x) => x && !/^Dear\b/.test(x) && !/^Kindest Regards/i.test(x));
}
