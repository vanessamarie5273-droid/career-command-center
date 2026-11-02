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
  // Descriptions only for roles we will actually evaluate, four at a time: one by one, a big board took minutes.
  const wanted = (data.jobs || []).filter((j) => isRelevantFamily(classifyTitle(j.title).family) && parseLocation(j.location?.name ?? null).isUS);
  const details = new Map<number, GHJob | null>();
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, wanted.length) }, async () => {
    while (next < wanted.length) {
      const j = wanted[next++];
      details.set(j.id, await getJson<GHJob>(f, `${base}/${j.id}`).catch(() => null));
    }
  }));
  const postings: RawPosting[] = (data.jobs || []).map((j) => {
    const detail = details.get(j.id) ?? null;
    const posted = j.first_published ?? detail?.first_published;
    return {
      provider: "GREENHOUSE" as const,
      externalId: `${token}:${j.id}`,
      title: j.title.trim(),
      department: detail?.departments?.[0]?.name ?? null,
      location: j.location?.name ?? null,
      descriptionHtml: detail?.content ?? null,
      applyUrl: j.absolute_url,
      // The posted date comes from the list; the detail call is the fallback in case a board's list leaves it out.
      postedAt: posted ? new Date(posted) : null,
    };
  });
  return { postings, total: data.meta?.total ?? postings.length };
}
