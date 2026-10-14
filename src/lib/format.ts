export const money = (n: number | null | undefined) => (n == null ? "—" : n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : `$${Math.round(n / 1000)}K`);
export const range = (a?: number | null, b?: number | null) => (a == null && b == null ? null : a != null && b != null && a !== b ? `${money(a)}–${money(b)}` : money(a ?? b));
export const date = (d: Date | string | null | undefined) => (d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Phoenix" }) : "—");
export const dateTime = (d: Date | string | null | undefined) => (d ? new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Phoenix" }) : "—");
export function ago(d: Date | string | null | undefined) {
  if (!d) return "—";
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export const STAGES = [
  ["RESEARCHING", "Researching"], ["PRIORITIZED", "Prioritized"], ["RESUME_PREP", "Resume in Preparation"], ["READY_TO_APPLY", "Ready to Apply"],
  ["APPLIED", "Applied"], ["RECRUITER_CONTACT", "Recruiter Contact"], ["HIRING_MANAGER", "Hiring Manager Engagement"], ["INTERVIEWING", "Interviewing"],
  ["FINAL_INTERVIEW", "Final Interview"], ["OFFER", "Offer"], ["ACCEPTED", "Accepted"], ["REJECTED", "Rejected"], ["WITHDRAWN", "Withdrawn"], ["ON_HOLD", "On Hold"],
] as const;
export type StageKey = (typeof STAGES)[number][0];
export const STAGE_LABEL = Object.fromEntries(STAGES) as Record<StageKey, string>;
export const TIER_LABEL: Record<string, string> = { TIER1: "Tier 1 · Pursue Immediately", TIER2: "Tier 2 · Strategic Target", TIER3: "Tier 3 · Monitor" };
