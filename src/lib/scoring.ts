// Explainable opportunity-matching model.
// Weights are exactly as specified: qualifications 25, compensation 20, company 15, equity 15,
// location 10, leadership scope 10, hiring momentum 5. Every point awarded or withheld has a reason.

import { classifyTitle, FAMILY_LABEL, type RoleFamily } from "./roles";
import { PROFILE } from "./profile";
import { parseLocation } from "./normalize";

export const WEIGHTS = {
  qualifications: 25,
  compensation: 20,
  company: 15,
  equity: 15,
  location: 10,
  leadership: 10,
  momentum: 5,
} as const;
export type Criterion = keyof typeof WEIGHTS;

export const CRITERION_LABEL: Record<Criterion, string> = {
  qualifications: "Qualifications & experience alignment",
  compensation: "Total compensation opportunity",
  company: "Company market position & growth",
  equity: "Equity upside & liquidity",
  location: "Location & work arrangement",
  leadership: "Leadership scope & progression",
  momentum: "Hiring momentum & accessibility",
};

export type ScoreInput = {
  title: string;
  descriptionText?: string | null;
  location?: string | null;
  isRemote?: boolean;
  workArrangement?: string | null;
  postedAt?: Date | null;
  salaryMin?: number | null; salaryMax?: number | null; oteMin?: number | null; oteMax?: number | null;
  equityMentioned?: boolean;
  requiresClearance?: boolean;
  yearsRequired?: number | null;
  company: {
    marketPositionScore?: number | null;
    equityUpsideScore?: number | null;
    compCompetitiveness?: number | null;
    ownership?: string | null;
    maturity?: string | null;
    totalOpenings?: number | null;
  };
};

export type Reason = { criterion: Criterion; delta: "+" | "-" | "="; text: string };
export type ScoreResult = {
  score: number;
  breakdown: Record<Criterion, number>; // points earned out of the weight
  reasons: Reason[];
  confidence: "High" | "Medium" | "Low";
  tier: "TIER1" | "TIER2" | "TIER3";
  category: "MAIN" | "RELOCATION" | "STRETCH" | "EXCLUDED";
  excludedReason?: string;
  family: RoleFamily;
  seniority: string;
};

const FAMILY_FIT: Record<RoleFamily, number> = {
  STRATEGIC_AE: 1, ENTERPRISE_AE: 0.95, ACCOUNT_DIRECTOR: 0.95, SALES_DIRECTOR: 0.85, SDR_LEADER: 1, BD_LEADER: 0.9,
  GTM_LEADER: 0.85, SALES_MANAGER: 0.75, SALES_VP: 0.6, PARTNER_ALLIANCES: 0.6, AE_OTHER: 0.45, SDR_IC: 0.15, NOT_RELEVANT: 0,
};
const LEADERSHIP_SCOPE: Record<string, number> = { EXEC: 1, VP: 1, HEAD: 0.95, DIRECTOR: 0.85, MANAGER: 0.7, SENIOR_IC: 0.5, IC: 0.3 };

export function scoreJob(j: ScoreInput, now = new Date()): ScoreResult {
  const reasons: Reason[] = [];
  const text = (j.descriptionText || "").toLowerCase();
  const { family, seniority, adjacent, stretch } = classifyTitle(j.title);
  const b = {} as Record<Criterion, number>;
  let known = 0;

  // 1. Qualifications (25)
  let q = FAMILY_FIT[family];
  reasons.push({ criterion: "qualifications", delta: q >= 0.8 ? "+" : q >= 0.5 ? "=" : "-", text: `Role type: ${FAMILY_LABEL[family]}${adjacent ? " (adjacent, transferable experience)" : ""}` });
  if (text.length > 400) {
    known++;
    const hits: string[] = [];
    for (const [area, kws] of Object.entries(PROFILE.strengths)) if (kws.some((k) => new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\&]/g, "\\$&")}\\b`).test(text))) hits.push(area);
    const domainBoost = Math.min(0.25, hits.length * 0.04);
    q = Math.min(1, q * 0.85 + domainBoost + 0.0);
    if (hits.length) reasons.push({ criterion: "qualifications", delta: "+", text: `Matches your experience in: ${hits.map((h) => h.replace(/_/g, " & ")).join(", ")}` });
    if (/\b(sap|oracle|workday|erp|cfo|finance transformation)\b/.test(text)) { q = Math.min(1, q + 0.05); reasons.push({ criterion: "qualifications", delta: "+", text: "Posting references ERP / Office-of-the-CFO selling where your SAP background is directly relevant" }); }
  } else {
    reasons.push({ criterion: "qualifications", delta: "=", text: "Little description text available; alignment judged on title only" });
  }
  if (j.yearsRequired != null) {
    if (j.yearsRequired > PROFILE.yearsExperience + 3) { q *= 0.75; reasons.push({ criterion: "qualifications", delta: "-", text: `Asks for ${j.yearsRequired}+ years; you have ~${PROFILE.yearsExperience} at SAP (gap to address)` }); }
    else reasons.push({ criterion: "qualifications", delta: "+", text: `Experience requirement (${j.yearsRequired}+ yrs) is within your ~${PROFILE.yearsExperience}+ years` });
  }
  b.qualifications = q * WEIGHTS.qualifications;

  // 2. Compensation (20) — only published numbers count as known
  const ote = j.oteMax ?? j.oteMin ?? null;
  const base = j.salaryMax ?? j.salaryMin ?? null;
  let c: number;
  if (ote) {
    known++;
    c = ote >= 350000 ? 1 : ote >= 300000 ? 0.92 : ote >= 250000 ? 0.8 : ote >= 200000 ? 0.6 : ote >= 160000 ? 0.4 : 0.2;
    reasons.push({ criterion: "compensation", delta: c >= 0.75 ? "+" : "-", text: `Published OTE up to $${Math.round(ote / 1000)}K` });
  } else if (base) {
    known++;
    // For quota-carrying roles a stated range is often base; typical 50/50 split
    c = base >= 220000 ? 1 : base >= 180000 ? 0.85 : base >= 150000 ? 0.7 : base >= 120000 ? 0.5 : 0.3;
    reasons.push({ criterion: "compensation", delta: c >= 0.7 ? "+" : "-", text: `Published pay range up to $${Math.round(base / 1000)}K (base or unspecified)` });
  } else {
    const cc = j.company.compCompetitiveness;
    c = cc != null ? 0.35 + (cc / 100) * 0.4 : 0.5;
    reasons.push({ criterion: "compensation", delta: "=", text: `No published pay; scored from the company's compensation reputation (AI assessment${cc != null ? `: ${cc}/100` : ", unknown"})` });
  }
  b.compensation = c * WEIGHTS.compensation;

  // 3. Company market position (15) — AI assessment stored on the company
  const mp = j.company.marketPositionScore;
  const m = mp != null ? mp / 100 : 0.5;
  reasons.push({ criterion: "company", delta: m >= 0.75 ? "+" : m >= 0.5 ? "=" : "-", text: mp != null ? `Company market position assessed ${mp}/100 (AI assessment)` : "Company market position not yet assessed" });
  b.company = m * WEIGHTS.company;

  // 4. Equity (15)
  const eu = j.company.equityUpsideScore;
  let e = eu != null ? eu / 100 : 0.4;
  if (j.equityMentioned) { e = Math.min(1, e + 0.05); reasons.push({ criterion: "equity", delta: "+", text: "Posting mentions equity in the package" }); }
  reasons.push({ criterion: "equity", delta: e >= 0.7 ? "+" : e >= 0.45 ? "=" : "-", text: eu != null ? `Equity upside assessed ${eu}/100 for a ${j.company.maturity || j.company.ownership || "company"} (AI assessment, not a guarantee of value)` : "Equity upside not yet assessed" });
  b.equity = e * WEIGHTS.equity;

  // 5. Location (10)
  const loc = parseLocation(j.location, { remoteFlag: j.isRemote, workplaceType: j.workArrangement, text });
  let l: number;
  let category: ScoreResult["category"] = "MAIN";
  if (j.location) known++;
  if (!loc.isUS) { l = 0; category = "EXCLUDED"; reasons.push({ criterion: "location", delta: "-", text: `Location outside the United States (${j.location})` }); }
  else if (loc.azMetro) { l = 1; reasons.push({ criterion: "location", delta: "+", text: `Based in the Phoenix/Scottsdale area (${loc.arrangement})` }); }
  else if (loc.isRemote) {
    const restricted = loc.states.length > 0 && !loc.states.includes("AZ");
    l = restricted ? 0.6 : 1;
    reasons.push({ criterion: "location", delta: restricted ? "=" : "+", text: restricted ? `Remote, but listed for ${loc.states.join(", ")}; confirm Arizona is eligible` : "Remote within the United States" });
  } else if (loc.states.some((s) => ["AZ", "NM", "NV", "UT", "CO"].includes(s)) || /southwest|mountain|west\b/.test((j.location || "").toLowerCase())) {
    l = 0.7; reasons.push({ criterion: "location", delta: "=", text: `Southwest territory (${j.location}); confirm home-office eligibility` });
  } else if (!j.location) { l = 0.5; reasons.push({ criterion: "location", delta: "=", text: "Location not stated" }); }
  else { l = 0.15; category = "RELOCATION"; reasons.push({ criterion: "location", delta: "-", text: `On-site/hybrid in ${j.location}; would require relocation` }); }
  b.location = l * WEIGHTS.location;

  // 6. Leadership scope (10)
  const ls = LEADERSHIP_SCOPE[seniority] ?? 0.3;
  const sdrLeader = family === "SDR_LEADER";
  const lsAdj = sdrLeader ? Math.max(ls, 0.85) : ls;
  reasons.push({ criterion: "leadership", delta: lsAdj >= 0.8 ? "+" : lsAdj >= 0.5 ? "=" : "-", text: sdrLeader ? "Sales development leadership, matching your record building SAP's NA Digital Hub and mentoring 50+ reps" : `Seniority: ${seniority.replace("_", " ").toLowerCase()}` });
  b.leadership = lsAdj * WEIGHTS.leadership;

  // 7. Hiring momentum (5)
  let h = 0.5;
  const openings = j.company.totalOpenings;
  if (openings != null) h = openings >= 200 ? 1 : openings >= 75 ? 0.85 : openings >= 25 ? 0.7 : openings >= 8 ? 0.55 : 0.4;
  if (j.postedAt) {
    known++;
    const days = (now.getTime() - j.postedAt.getTime()) / 86400000;
    if (days <= 14) { h = Math.min(1, h + 0.15); reasons.push({ criterion: "momentum", delta: "+", text: `Posted ${Math.max(0, Math.round(days))} days ago (fresh)` }); }
    else if (days > 60) { h = Math.max(0, h - 0.25); reasons.push({ criterion: "momentum", delta: "-", text: `Posted ${Math.round(days)} days ago; may be filled or evergreen` }); }
  }
  if (openings != null) reasons.push({ criterion: "momentum", delta: h >= 0.7 ? "+" : "=", text: `${openings} total openings at the company right now` });
  b.momentum = h * WEIGHTS.momentum;

  let score = Math.round(Object.values(b).reduce((a, x) => a + x, 0));
  let excludedReason: string | undefined;
  if (j.requiresClearance) { category = "EXCLUDED"; excludedReason = "Requires an active security clearance"; reasons.push({ criterion: "qualifications", delta: "-", text: "Requires an active security clearance you do not hold" }); }
  if (!loc.isUS) excludedReason = "Outside the United States";
  if (family === "NOT_RELEVANT") { category = "EXCLUDED"; excludedReason = "Not a sales or sales-leadership role"; }
  if (family === "SDR_IC") { category = "EXCLUDED"; excludedReason = "Entry-level SDR/BDR role, below your level"; }
  if (category === "MAIN" && stretch) category = "STRETCH";

  const confidence = known >= 4 ? "High" : known >= 2 ? "Medium" : "Low";
  let tier: ScoreResult["tier"] = score >= 72 ? "TIER1" : score >= 60 ? "TIER2" : "TIER3";
  // Tier 1 requires an excellent fit, not just a strong company
  if (tier === "TIER1" && FAMILY_FIT[family] < 0.85) tier = "TIER2";
  if (category !== "MAIN") tier = tier === "TIER1" ? "TIER2" : tier;
  if (category === "EXCLUDED") { tier = "TIER3"; score = Math.min(score, 40); }

  return { score, breakdown: roundAll(b), reasons, confidence, tier, category, excludedReason, family, seniority };
}

function roundAll(b: Record<Criterion, number>) {
  return Object.fromEntries(Object.entries(b).map(([k, v]) => [k, Math.round(v * 10) / 10])) as Record<Criterion, number>;
}

/** Company attractiveness is ranked independently of whether it has a suitable opening today. */
export function companyAttractiveness(c: { marketPositionScore?: number | null; equityUpsideScore?: number | null; compCompetitiveness?: number | null }) {
  const mp = c.marketPositionScore ?? 50, eq = c.equityUpsideScore ?? 40, cc = c.compCompetitiveness ?? 50;
  return Math.round(mp * 0.45 + eq * 0.3 + cc * 0.25);
}

export function effectiveTier(j: { tier: string | null; overrideTier: string | null }) {
  return (j.overrideTier ?? j.tier) as "TIER1" | "TIER2" | "TIER3" | null;
}
export function effectiveScore(j: { score: number | null; overrideScore: number | null }) {
  return j.overrideScore ?? j.score;
}
