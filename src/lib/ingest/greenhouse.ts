import { getJson } from "./http";
import type { BoardResult, FetchLike, RawPosting } from "./types";

type GH = { jobs: { id: number; title: string; absolute_url: string; location?: { name?: string }; updated_at?: string; first_published?: string; content?: string; departments?: { name: string }[] }[]; meta?: { total?: number } };

export async function fetchGreenhouse(token: string, f: FetchLike = fetch): Promise<BoardResult> {
  const data = await getJson<GH>(f, `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=true`);
  const postings: RawPosting[] = (data.jobs || []).map((j) => ({
    provider: "GREENHOUSE",
    externalId: `${token}:${j.id}`,
    title: j.title.trim(),
    department: j.departments?.[0]?.name ?? null,
    location: j.location?.name ?? null,
    descriptionHtml: j.content ?? null,
    applyUrl: j.absolute_url,
    postedAt: j.first_published ? new Date(j.first_published) : null,
  }));
  return { postings, total: data.meta?.total ?? postings.length };
}
