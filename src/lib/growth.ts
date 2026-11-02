// Growth outlook: the AI growth-potential assessment plus live signals the app already records
// (hiring volume from the company's job board, funding news, verified revenue growth).

export type GrowthSignal = { delta: "+" | "-" | "="; text: string };
export type GrowthCompany = {
  growthScore?: number | null; growthThesis?: string | null; totalOpenings?: number | null; revenueGrowth?: string | null;
  news?: { kind: string; headline: string; publishedAt: Date | null; createdAt?: Date }[];
};

export const GROWTH_LABELS = [[85, "Hypergrowth"], [70, "High growth"], [50, "Steady growth"], [0, "Slow growth"]] as const;
export const growthLabel = (score: number) => GROWTH_LABELS.find(([min]) => score >= min)![1];

export function growthOutlook(c: GrowthCompany, now = new Date()) {
  const signals: GrowthSignal[] = [];
  let score = c.growthScore ?? 50;
  signals.push(c.growthScore != null
    ? { delta: c.growthScore >= 70 ? "+" : c.growthScore >= 50 ? "=" : "-", text: `Growth potential assessed ${c.growthScore}/100 (AI assessment)${c.growthThesis ? `: ${c.growthThesis}` : ""}` }
    : { delta: "=", text: "Growth potential not yet assessed" });

  const n = c.totalOpenings;
  if (n != null) {
    if (n >= 200) { score += 4; signals.push({ delta: "+", text: `Hiring at scale: ${n} open roles on its job board` }); }
    else if (n >= 75) { score += 2; signals.push({ delta: "+", text: `Hiring steadily: ${n} open roles on its job board` }); }
    else if (n < 8) { score -= 3; signals.push({ delta: "-", text: `Few open roles (${n}) on its job board` }); }
  }

  const recent = (c.news ?? []).filter((x) => x.kind === "funding" && now.getTime() - (x.publishedAt ?? x.createdAt ?? now).getTime() <= 180 * 86400000);
  if (recent.length) { score += 4; signals.push({ delta: "+", text: `Raised funding in the last 6 months: ${recent[0].headline}` }); }

  const pct = Number(c.revenueGrowth?.match(/(-?\d+(?:\.\d+)?)\s*%/)?.[1]);
  if (c.revenueGrowth && !isNaN(pct)) {
    if (pct >= 50) { score += 6; signals.push({ delta: "+", text: `Verified revenue growth of ${pct}%` }); }
    else if (pct >= 30) { score += 3; signals.push({ delta: "+", text: `Verified revenue growth of ${pct}%` }); }
    else if (pct < 10) { score -= 5; signals.push({ delta: "-", text: `Verified revenue growth of only ${pct}%` }); }
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  return { score, label: growthLabel(score), assessed: c.growthScore != null, signals };
}
