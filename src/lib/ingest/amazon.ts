// amazon.jobs, Amazon's own careers site, serves its search results as JSON.
// Token: "amazon" for every Amazon business, or "amazon|Amazon Web Services" to keep one business (matched on company name).
import { getJson } from "./http";
import type { BoardResult, FetchLike, RawPosting } from "./types";
import { classifyTitle, isRelevantFamily } from "../roles";

type AJ = {
  hits?: number;
  jobs?: {
    id_icims?: string; id?: string; title: string; job_path: string; posted_date?: string; location?: string; normalized_location?: string;
    country_code?: string; company_name?: string; business_category?: string; description?: string; basic_qualifications?: string; preferred_qualifications?: string;
  }[];
};

const QUERIES = ["account executive", "account manager", "sales director", "business development", "sales development", "head of sales"];

export async function fetchAmazon(token: string, f: FetchLike = fetch): Promise<BoardResult> {
  const filter = token.split("|")[1]?.toLowerCase();
  const seen = new Map<string, NonNullable<AJ["jobs"]>[number]>();
  let total = 0;
  for (const q of QUERIES) {
    for (let offset = 0; offset < 500; offset += 100) {
      const url = `https://www.amazon.jobs/en/search.json?base_query=${encodeURIComponent(q)}&normalized_country_code%5B%5D=USA&result_limit=100&offset=${offset}&sort=recent`;
      const r = await getJson<AJ>(f, url);
      if (!Array.isArray(r.jobs)) throw new Error("Unexpected amazon.jobs response");
      total = Math.max(total, r.hits ?? 0);
      // Keep only the roles we evaluate, so thousands of unrelated descriptions are not held in memory.
      for (const j of r.jobs) if (isRelevantFamily(classifyTitle(j.title).family)) seen.set(j.id_icims || j.id || j.job_path, j);
      if (r.jobs.length < 100) break;
    }
  }
  const postings: RawPosting[] = [];
  for (const [id, j] of seen) {
    if (filter && !`${j.company_name ?? ""} ${j.business_category ?? ""}`.toLowerCase().includes(filter) && !j.title.toLowerCase().includes(filter)) continue;
    const html = [j.description, j.basic_qualifications && `<h3>Basic qualifications</h3>${j.basic_qualifications}`, j.preferred_qualifications && `<h3>Preferred qualifications</h3>${j.preferred_qualifications}`].filter(Boolean).join("\n");
    const posted = j.posted_date ? new Date(j.posted_date) : null;
    postings.push({
      provider: "AMAZON", externalId: `amazon:${id}`, title: j.title.trim(),
      location: j.normalized_location || j.location || null, isRemote: /virtual|remote/i.test(`${j.location} ${j.normalized_location}`),
      descriptionHtml: html || null, applyUrl: `https://www.amazon.jobs${j.job_path}`,
      postedAt: posted && !isNaN(posted.getTime()) ? posted : null,
    });
  }
  return { postings, total: total || postings.length };
}
