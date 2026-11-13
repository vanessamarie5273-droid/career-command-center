// Workday-hosted career sites expose the same JSON endpoints their public job search pages use.
// Token format: "tenant|wdN|SiteName", e.g. "workday|wd5|Workday".
import { getJson, UA } from "./http";
import type { BoardResult, FetchLike, RawPosting } from "./types";
import { classifyTitle, isRelevantFamily } from "../roles";

type Search = { total: number; jobPostings: { title?: string; externalPath: string; locationsText?: string; postedOn?: string; remoteType?: string }[] };
type Detail = { jobPostingInfo?: { jobDescription?: string; location?: string; startDate?: string; externalUrl?: string; jobReqId?: string; remoteType?: string; additionalLocations?: string[] } };

const QUERIES = ["account executive", "sales director", "business development", "sales development", "account director", "head of sales", "vice president sales"];

export async function fetchWorkday(token: string, f: FetchLike = fetch): Promise<BoardResult> {
  const [tenant, wd, site] = token.split("|");
  if (!tenant || !wd || !site) throw new Error(`Bad Workday token "${token}" (expected tenant|wdN|Site)`);
  const host = `https://${tenant}.${wd}.myworkdayjobs.com`;
  const api = `${host}/wday/cxs/${tenant}/${site}`;
  // Some Workday sites (Dell, Qualcomm, Optum answered 422 on Nov 11) only take searches from a visitor who has opened the
  // careers site, the way a browser does. A rejected search is retried once with that site's session cookies.
  let session: Record<string, string> | null = null;
  const send = (body: object) => getJson<Search>(f, `${api}/jobs`, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json", "Accept-Language": "en-US", ...(session ?? {}) } });
  const post = async (body: object) => {
    try { return await send(body); } catch (e) {
      if (session || !/HTTP (400|401|403|422)\b/.test((e as Error).message)) throw e;
      session = await openSession(f, host, site);
      return send(body);
    }
  };
  // 20 is the page size every Workday site accepts (some reject other limits).
  const totalRes = await post({ appliedFacets: {}, limit: 20, offset: 0, searchText: "" });
  const seen = new Map<string, Search["jobPostings"][number]>();
  for (const q of QUERIES) {
    for (let offset = 0; offset < 200; offset += 20) {
      const r = await post({ appliedFacets: {}, limit: 20, offset, searchText: q });
      // Some Workday sites mix untitled entries into search results; they are not readable postings.
      for (const p of r.jobPostings || []) if (p.title?.trim() && p.externalPath) seen.set(p.externalPath, p);
      if (!r.jobPostings || r.jobPostings.length < 20) break;
    }
  }
  const postings: RawPosting[] = [];
  for (const p of seen.values()) {
    const title = p.title!.trim();
    if (!isRelevantFamily(classifyTitle(title).family)) continue;
    const d = await getJson<Detail>(f, `${api}${p.externalPath}`).catch(() => null);
    const info = d?.jobPostingInfo;
    postings.push({
      provider: "WORKDAY", externalId: `${tenant}:${info?.jobReqId || p.externalPath}`, title,
      location: [info?.location || p.locationsText, ...(info?.additionalLocations || [])].filter(Boolean).join("; "),
      isRemote: /remote/i.test(info?.remoteType || p.remoteType || ""), workplaceType: info?.remoteType || p.remoteType || null,
      descriptionHtml: info?.jobDescription || null, applyUrl: info?.externalUrl || `${host}/${site}${p.externalPath}`,
      postedAt: info?.startDate ? new Date(info.startDate) : null,
    });
  }
  return { postings, total: totalRes.total ?? postings.length };
}

/** Opens the public careers page and returns the headers a browser on that page sends with its job searches. */
export async function openSession(f: FetchLike, host: string, site: string): Promise<Record<string, string>> {
  const page = `${host}/en-US/${site}`;
  const headers: Record<string, string> = { Origin: host, Referer: page };
  try {
    const res = await f(page, { headers: { "User-Agent": UA, Accept: "text/html", "Accept-Language": "en-US" }, signal: AbortSignal.timeout(20000) });
    const raw = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : (res.headers.get("set-cookie") ?? "").split(/,(?=\s*[A-Za-z0-9_.-]+=)/);
    const cookies = raw.map((c) => c.split(";")[0].trim()).filter((c) => c.includes("="));
    if (cookies.length) headers.Cookie = cookies.join("; ");
    const csrf = cookies.find((c) => /^CALYPSO_CSRF_TOKEN=/i.test(c));
    if (csrf) headers["X-CALYPSO-CSRF-TOKEN"] = csrf.split("=").slice(1).join("=");
  } catch { /* the retry still goes out with Origin and Referer */ }
  return headers;
}
