// Resume parsing, ATS readability checks and resume-to-job gap analysis.
// Recommendations only ever point to experience already present in the resume or in the stated profile.
import { PROFILE } from "./profile";

export async function extractText(buf: Buffer, mime: string, fileName: string): Promise<string> {
  const lower = fileName.toLowerCase();
  if (mime === "application/pdf" || lower.endsWith(".pdf")) {
    const pdf = (await import("pdf-parse/lib/pdf-parse.js")).default as (b: Buffer) => Promise<{ text: string }>;
    return (await pdf(buf)).text;
  }
  if (lower.endsWith(".docx") || mime.includes("wordprocessingml")) {
    const mammoth = await import("mammoth");
    return (await mammoth.extractRawText({ buffer: buf })).value;
  }
  if (mime.startsWith("text/") || /\.(txt|md)$/.test(lower)) return buf.toString("utf8");
  return "";
}

export const VOCAB = [
  // selling motion
  "enterprise", "strategic accounts", "named accounts", "new logo", "net new", "expansion", "upsell", "cross-sell", "quota", "quota attainment", "president's club", "pipeline generation", "self-sourced", "forecasting", "forecast accuracy", "territory plan", "account planning", "executive engagement", "c-suite", "c-level", "multi-threaded", "complex sales", "solution selling", "value selling", "consultative", "meddic", "meddpicc", "challenger", "command of the message", "negotiation", "procurement", "rfp", "contract", "deal cycle", "sales cycle", "land and expand", "partner", "alliances", "channel", "systems integrators", "si partners", "hyperscaler", "aws marketplace", "co-sell",
  // leadership
  "sales development", "sdr", "bdr", "team leadership", "hiring", "coaching", "mentoring", "enablement", "playbook", "go-to-market", "gtm", "icp", "tam", "segmentation", "revenue operations", "kpis", "metrics", "cross-functional", "methodology", "outbound", "inbound",
  // domain
  "saas", "cloud", "erp", "sap", "oracle", "workday", "salesforce", "artificial intelligence", "machine learning", "generative ai", "genai", "llm", "agents", "data platform", "analytics", "cybersecurity", "security", "identity", "compliance", "hipaa", "fedramp", "public sector", "state and local", "sled", "federal", "government", "higher education", "healthcare", "health systems", "payer", "provider", "life sciences", "pharma", "financial services", "regulated industries", "cfo", "office of the cfo", "finance transformation", "fp&a", "procure-to-pay", "supply chain", "digital transformation", "automation", "workflow", "platform", "api", "infrastructure",
] as const;

const has = (text: string, term: string) => new RegExp(`(^|[^a-z0-9])${term.replace(/[.*+?^${}()|[\]\\&]/g, "\\$&")}([^a-z0-9]|$)`, "i").test(text);

export type AtsCheck = { label: string; pass: boolean; detail: string };

export function atsReport(text: string, fileName: string) {
  const words = text.split(/\s+/).filter(Boolean).length;
  const checks: AtsCheck[] = [
    { label: "Text is machine-readable", pass: words > 150, detail: words > 150 ? `${words} words extracted` : "Very little text could be extracted; the file may be an image or scanned PDF. Export a text-based PDF or .docx." },
    { label: "Email address", pass: /[\w.+-]+@[\w-]+\.[\w.]+/.test(text), detail: "ATS parsers look for contact details in the body text" },
    { label: "Phone number", pass: /(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/.test(text), detail: "" },
    { label: "LinkedIn URL", pass: /linkedin\.com\/in\//i.test(text), detail: "" },
    { label: "Standard 'Experience' heading", pass: /\n\s*(professional )?(experience|employment|work history)\b/i.test(`\n${text}`), detail: "Use a plain heading such as Experience" },
    { label: "Education section", pass: /\beducation\b/i.test(text), detail: "" },
    { label: "Skills or summary section", pass: /\b(skills|summary|profile|core competencies|expertise)\b/i.test(text), detail: "" },
    { label: "Dates on roles", pass: (text.match(/\b(19|20)\d{2}\b/g) || []).length >= 4, detail: "Each role should show start and end dates" },
    { label: "Quantified results", pass: (text.match(/(\$\s?\d|\d+\s?%|\d+x\b)/gi) || []).length >= 5, detail: `${(text.match(/(\$\s?\d|\d+\s?%|\d+x\b)/gi) || []).length} quantified figures found` },
    { label: "Length", pass: words >= 350 && words <= 1300, detail: `${words} words (aim for roughly 450–1,100 for a senior sales resume)` },
    { label: "File format", pass: /\.(docx|pdf)$/i.test(fileName), detail: "DOCX and text-based PDF parse most reliably" },
    { label: "No tables/columns artifacts", pass: !/\t{2,}|\s{12,}\S/.test(text), detail: "Large gaps suggest multi-column layouts that some ATS read out of order" },
  ];
  const score = Math.round((checks.filter((c) => c.pass).length / checks.length) * 100);
  return { score, checks, words };
}

export function keywordGap(resumeText: string, jd: { text: string; required?: string | null; preferred?: string | null }) {
  const jdTerms: string[] = VOCAB.filter((t) => has(jd.text, t));
  const reqTerms = new Set<string>(VOCAB.filter((t) => jd.required && has(jd.required, t)));
  const prefTerms = new Set<string>(VOCAB.filter((t) => jd.preferred && has(jd.preferred, t)));
  const matched = jdTerms.filter((t) => has(resumeText, t));
  const missing = jdTerms.filter((t) => !has(resumeText, t));
  const profileText = `${PROFILE.summary} ${PROFILE.facts.join(" ")} ${Object.values(PROFILE.strengths).flat().join(" ")}`;
  const recommendations = missing.map((t) => {
    const supported = has(profileText, t);
    return {
      term: t,
      importance: reqTerms.has(t) ? "required" : prefTerms.has(t) ? "preferred" : "mentioned",
      supported,
      advice: supported
        ? `Your stated background supports “${t}”. Make it explicit in a bullet you can defend with specifics.`
        : `“${t}” is not in your resume or stated profile. Only add it if it is genuinely part of your experience.`,
    };
  }).sort((a, b) => (a.importance === "required" ? -1 : 0) - (b.importance === "required" ? -1 : 0) || Number(b.supported) - Number(a.supported));
  const weight = (t: string) => (reqTerms.has(t) ? 2 : 1);
  const total = jdTerms.reduce((a, t) => a + weight(t), 0);
  const got = matched.reduce((a, t) => a + weight(t), 0);
  return { matchScore: total ? Math.round((got / total) * 100) : null, matched, missing, recommendations };
}
