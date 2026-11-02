// Oracle Recruiting Cloud career sites (Oracle itself and many large employers) expose the same REST endpoints
// their public job search pages use. Token: "host|siteNumber", e.g. "eeho.fa.us2.oraclecloud.com|CX_45001".
import { getJson } from "./http";
import type { BoardResult, FetchLike, RawPosting } from "./types";
import { classifyTitle, isRelevantFamily } from "../roles";

type Req = { Id: string; Title: string; PostedDate?: string; PrimaryLocation?: string; PrimaryLocationCountry?: string; WorkplaceType?: string; secondaryLocations?: { Name?: string }[] };
type Search = { items?: { TotalJobsCount?: number; requisitionList?: Req[] }[] };
type Detail = { items?: { ExternalDescriptionStr?: string; ExternalResponsibilitiesStr?: string; ExternalQualificationsStr?: string }[] };

const QUERIES = ["account executive", "sales director", "business development", "sales development", "account director", "sales manager"];

export async function fetchOracle(token: string, f: FetchLike = fetch): Promise<BoardResult> {
  const [host, site] = token.split("|");
  if (!host || !site) throw new Error(`Bad Oracle token "${token}" (expected host|siteNumber)`);
  const api = `https://${host}/hcmRestApi/resources/latest`;
  const seen = new Map<string, Req>();
  let total = 0;
  for (const q of QUERIES) {
    for (let offset = 0; offset < 200; offset += 25) {
      const finder = `findReqs;siteNumber=${site},keyword=${q},limit=25,offset=${offset},sortBy=POSTING_DATES_DESC`;
      const r = await getJson<Search>(f, `${api}/recruitingCEJobRequisitions?onlyData=true&expand=requisitionList.secondaryLocations&finder=${encodeURIComponent(finder)}`);
      const page = r.items?.[0];
      if (!page) throw new Error("Unexpected Oracle Recruiting response");
      total = Math.max(total, page.TotalJobsCount ?? 0);
      for (const j of page.requisitionList ?? []) seen.set(j.Id, j);
      if ((page.requisitionList ?? []).length < 25) break;
    }
  }
  const postings: RawPosting[] = [];
  for (const j of seen.values()) {
    if (!isRelevantFamily(classifyTitle(j.Title).family)) continue;
    const finder = `ById;Id="${j.Id}",siteNumber=${site}`;
    const d = await getJson<Detail>(f, `${api}/recruitingCEJobRequisitionDetails?expand=all&onlyData=true&finder=${encodeURIComponent(finder)}`).catch(() => null);
    const info = d?.items?.[0];
    postings.push({
      provider: "ORACLE", externalId: `${host}:${j.Id}`, title: j.Title.trim(),
      location: [j.PrimaryLocation, ...(j.secondaryLocations ?? []).map((l) => l.Name)].filter(Boolean).join("; ") || null,
      isRemote: /remote/i.test(j.WorkplaceType || ""), workplaceType: j.WorkplaceType || null,
      descriptionHtml: [info?.ExternalDescriptionStr, info?.ExternalResponsibilitiesStr, info?.ExternalQualificationsStr].filter(Boolean).join("\n") || null,
      applyUrl: `https://${host}/hcmUI/CandidateExperience/en/sites/${site}/job/${j.Id}`,
      postedAt: j.PostedDate ? new Date(j.PostedDate) : null,
    });
  }
  return { postings, total: total || postings.length };
}
