// Workable's public careers widget API. Token: the account subdomain, e.g. "acme" for apply.workable.com/acme.
import { getJson } from "./http";
import type { BoardResult, FetchLike, RawPosting } from "./types";

type WK = {
  jobs?: {
    title: string; shortcode: string; url?: string; application_url?: string; shortlink?: string; telecommuting?: boolean; department?: string;
    published_on?: string; created_at?: string; city?: string; state?: string; country?: string; description?: string;
    locations?: { city?: string; region?: string; country?: string; hidden?: boolean }[];
  }[];
};

export async function fetchWorkable(account: string, f: FetchLike = fetch): Promise<BoardResult> {
  const data = await getJson<WK>(f, `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(account)}?details=true`);
  if (!Array.isArray(data.jobs)) throw new Error("Unexpected Workable response");
  const postings: RawPosting[] = data.jobs.map((j) => {
    const places = (j.locations?.length ? j.locations.filter((l) => !l.hidden).map((l) => [l.city, l.region, l.country].filter(Boolean).join(", ")) : [[j.city, j.state, j.country].filter(Boolean).join(", ")]).filter(Boolean);
    const date = j.published_on || j.created_at;
    return {
      provider: "WORKABLE" as const,
      externalId: `${account}:${j.shortcode}`,
      title: j.title.trim(),
      department: j.department || null,
      location: (j.telecommuting ? "Remote, " : "") + places.join("; "),
      isRemote: !!j.telecommuting,
      descriptionHtml: j.description ?? null,
      applyUrl: j.url || j.shortlink || `https://apply.workable.com/${account}/j/${j.shortcode}/`,
      postedAt: date ? new Date(date) : null,
    };
  });
  return { postings, total: postings.length };
}
