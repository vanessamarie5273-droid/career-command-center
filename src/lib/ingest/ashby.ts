import { getJson } from "./http";
import type { BoardResult, FetchLike, RawPosting } from "./types";

type Comp = { compensationType?: string; minValue?: number | null; maxValue?: number | null; interval?: string; currencyCode?: string; summary?: string };
type AS = {
  jobs: {
    id: string; title: string; department?: string; team?: string; location?: string; secondaryLocations?: { location: string }[];
    isRemote?: boolean; workplaceType?: string; publishedAt?: string; jobUrl: string; applyUrl?: string; descriptionHtml?: string; descriptionPlain?: string; isListed?: boolean;
    compensation?: { compensationTierSummary?: string; summaryComponents?: Comp[]; compensationTiers?: { components?: Comp[]; tierSummary?: string }[] };
  }[];
};

export async function fetchAshby(board: string, f: FetchLike = fetch): Promise<BoardResult> {
  const data = await getJson<AS>(f, `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board)}?includeCompensation=true`);
  const postings: RawPosting[] = (data.jobs || []).filter((j) => j.isListed !== false).map((j) => {
    const comps = j.compensation?.summaryComponents || [];
    const usdYear = (c: Comp) => (c.currencyCode || "USD") === "USD" && /year|annual/i.test(c.interval || "1 YEAR");
    const salary = comps.find((c) => c.compensationType === "Salary" && usdYear(c));
    const ote = comps.find((c) => /OnTarget|OTE|Commission/i.test(c.compensationType || "") && usdYear(c));
    const equity = comps.some((c) => /Equity/i.test(c.compensationType || ""));
    const loc = [j.location, ...(j.secondaryLocations || []).map((s) => s.location)].filter(Boolean).join("; ");
    return {
      provider: "ASHBY" as const,
      externalId: `${board}:${j.id}`,
      title: j.title.trim(),
      department: j.department || j.team || null,
      location: loc || null,
      workplaceType: j.workplaceType || null,
      isRemote: !!j.isRemote,
      descriptionHtml: j.descriptionHtml || null,
      descriptionText: j.descriptionPlain || null,
      applyUrl: j.jobUrl,
      postedAt: j.publishedAt ? new Date(j.publishedAt) : null,
      comp: salary || ote || equity ? {
        salaryMin: salary?.minValue ?? undefined, salaryMax: salary?.maxValue ?? undefined,
        oteMin: ote && /OnTarget|OTE/i.test(ote.compensationType || "") ? ote.minValue ?? undefined : undefined,
        oteMax: ote && /OnTarget|OTE/i.test(ote.compensationType || "") ? ote.maxValue ?? undefined : undefined,
        summary: j.compensation?.compensationTierSummary, equity,
      } : null,
    };
  });
  return { postings, total: postings.length };
}
