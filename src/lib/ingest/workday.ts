// Workday-hosted career sites expose the same JSON endpoints their public job search pages use.
// Token format: "tenant|wdN|SiteName", e.g. "workday|wd5|Workday".
import { getJson } from "./http";
import type { BoardResult, FetchLike, RawPosting } from "./types";
import { classifyTitle, isRelevantFamily } from "../roles";

type Search = { total: number; jobPostings: { title: string; externalPath: string; locationsText?: string; postedOn?: string; remoteType?: string }[] };
type Detail = { jobPostingInfo?: { jobDescription?: string; location?: string; startDate?: string; externalUrl?: string; jobReqId?: string; remoteType?: string; additionalLocations?: string[] } };

const QUERIES = ["account executive", "sales director", "business development", "sales development", "account director", "head of sales", "vice president sales"];

export async function fetchWorkday(token: string, f: FetchLike = fetch): Promise<BoardResult> {
  const [tenant, wd, site] = token.split("|");
  if (!tenant || !wd || !site) throw new Error(`Bad Workday token "${token}" (expected tenant|wdN|Site)`);
  const host = `https://${tenant}.${wd}.myworkdayjobs.com`;
  const api = `${host}/wday/cxs/${tenant}/${site}`;
  const post = (body: object) => getJson<Search>(f, `${api}/jobs`, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
  const totalRes = await post({ appliedFacets: {}, limit: 1, offset: 0, searchText: "" });
  const seen = new Map<string, Search["jobPostings"][number]>();
  for (const q of QUERIES) {
    for (let offset = 0; offset < 200; offset += 20) {
      const r = await post({ appliedFacets: {}, limit: 20, offset, searchText: q });
      for (const p of r.jobPostings || []) seen.set(p.externalPath, p);
      if (!r.jobPostings || r.jobPostings.length < 20) break;
    }
  }
  const postings: RawPosting[] = [];
  for (const p of seen.values()) {
    if (!isRelevantFamily(classifyTitle(p.title).family)) continue;
    const d = await getJson<Detail>(f, `${api}${p.externalPath}`).catch(() => null);
    const info = d?.jobPostingInfo;
    postings.push({
      provider: "WORKDAY", externalId: `${tenant}:${info?.jobReqId || p.externalPath}`, title: p.title.trim(),
      location: [info?.location || p.locationsText, ...(info?.additionalLocations || [])].filter(Boolean).join("; "),
      isRemote: /remote/i.test(info?.remoteType || p.remoteType || ""), workplaceType: info?.remoteType || p.remoteType || null,
      descriptionHtml: info?.jobDescription || null, applyUrl: info?.externalUrl || `${host}/${site}${p.externalPath}`,
      postedAt: info?.startDate ? new Date(info.startDate) : null,
    });
  }
  return { postings, total: totalRes.total ?? postings.length };
}
