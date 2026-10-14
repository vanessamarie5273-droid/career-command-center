import { getJson } from "./http";
import type { BoardResult, FetchLike, RawPosting } from "./types";
import { classifyTitle, isRelevantFamily } from "../roles";

type List = { totalFound: number; content: { id: string; name: string; releasedDate?: string; location?: { city?: string; region?: string; country?: string; remote?: boolean; fullLocation?: string }; department?: { label?: string } }[] };
type Detail = { jobAd?: { sections?: Record<string, { title?: string; text?: string }> }; applyUrl?: string; postingUrl?: string };

export async function fetchSmartRecruiters(company: string, f: FetchLike = fetch): Promise<BoardResult> {
  const base = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(company)}/postings`;
  const all: List["content"] = [];
  let total = 0;
  for (let offset = 0; offset < 2000; offset += 100) {
    const page = await getJson<List>(f, `${base}?limit=100&offset=${offset}`);
    total = page.totalFound;
    all.push(...page.content);
    if (page.content.length < 100) break;
  }
  const postings: RawPosting[] = [];
  for (const p of all) {
    const loc = p.location?.fullLocation || [p.location?.city, p.location?.region, p.location?.country?.toUpperCase()].filter(Boolean).join(", ");
    const relevant = isRelevantFamily(classifyTitle(p.name).family);
    let html: string | null = null;
    let apply = `https://jobs.smartrecruiters.com/${company}/${p.id}`;
    if (relevant) {
      // Only fetch full descriptions for roles we will actually evaluate.
      const d = await getJson<Detail>(f, `${base}/${p.id}`).catch(() => null);
      if (d?.jobAd?.sections) html = Object.values(d.jobAd.sections).map((s) => `<h3>${s.title || ""}</h3>${s.text || ""}`).join("\n");
      if (d?.postingUrl) apply = d.postingUrl;
    }
    postings.push({
      provider: "SMARTRECRUITERS", externalId: `${company}:${p.id}`, title: p.name.trim(), department: p.department?.label ?? null,
      location: (p.location?.remote ? "Remote, " : "") + loc, isRemote: !!p.location?.remote, descriptionHtml: html, applyUrl: apply,
      postedAt: p.releasedDate ? new Date(p.releasedDate) : null,
    });
  }
  return { postings, total };
}
