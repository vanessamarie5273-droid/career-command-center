import { getJson } from "./http";
import type { BoardResult, FetchLike, RawPosting } from "./types";
import { classifyTitle, isRelevantFamily } from "../roles";
import { parseLocation } from "../normalize";

type GHJob = { id: number; title: string; absolute_url: string; location?: { name?: string }; updated_at?: string; first_published?: string; content?: string; departments?: { name: string }[] };
type GH = { jobs: GHJob[]; meta?: { total?: number } };

export async function fetchGreenhouse(token: string, f: FetchLike = fetch): Promise<BoardResult> {
  const base = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs`;
  // The list without content stays small even for boards with thousands of roles. Asking for every
  // description at once (content=true) returned tens of megabytes and ran the web server out of memory.
  const data = await getJson<GH>(f, base);
  const postings: RawPosting[] = [];
  for (const j of data.jobs || []) {
    const location = j.location?.name ?? null;
    let detail: GHJob | null = null;
    // Only fetch full descriptions for roles we will actually evaluate.
    if (isRelevantFamily(classifyTitle(j.title).family) && parseLocation(location).isUS) {
      detail = await getJson<GHJob>(f, `${base}/${j.id}`).catch(() => null);
    }
    postings.push({
      provider: "GREENHOUSE",
      externalId: `${token}:${j.id}`,
      title: j.title.trim(),
      department: detail?.departments?.[0]?.name ?? null,
      location,
      descriptionHtml: detail?.content ?? null,
      applyUrl: j.absolute_url,
      postedAt: j.first_published ? new Date(j.first_published) : null,
    });
  }
  return { postings, total: data.meta?.total ?? postings.length };
}
