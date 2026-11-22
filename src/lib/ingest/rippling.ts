// Rippling's own applicant tracking (ats.rippling.com/<board>/jobs) publishes each board as JSON, the list its careers
// page reads. The list has title, team, location and link; it carries no description or posted date.
import { getJson } from "./http";
import type { BoardResult, FetchLike, RawPosting } from "./types";

type RP = { uuid: string; name?: string; url?: string; department?: { label?: string } | null; workLocation?: { label?: string } | null }[];

export async function fetchRippling(board: string, f: FetchLike = fetch): Promise<BoardResult> {
  const data = await getJson<RP>(f, `https://api.rippling.com/platform/api/ats/v1/board/${encodeURIComponent(board)}/jobs`, {}, 3, 60_000);
  if (!Array.isArray(data)) throw new Error("Unexpected Rippling response");
  const postings: RawPosting[] = data.filter((j) => j.uuid && j.name?.trim()).map((j) => {
    const location = j.workLocation?.label?.trim() || null;
    return {
      provider: "RIPPLING" as const,
      externalId: `${board}:${j.uuid}`,
      title: j.name!.trim().replace(/\s+/g, " "),
      department: j.department?.label || null,
      location,
      isRemote: /remote/i.test(location ?? ""),
      descriptionHtml: null,
      applyUrl: j.url || `https://ats.rippling.com/${board}/jobs/${j.uuid}`,
      postedAt: null,
    };
  });
  return { postings, total: postings.length };
}
