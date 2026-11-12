import { getJson } from "./http";
import { BoardNotFound, type BoardResult, type FetchLike, type RawPosting } from "./types";

type LV = {
  id: string; text: string; hostedUrl: string; applyUrl?: string; createdAt?: number; workplaceType?: string;
  categories?: { location?: string; team?: string; department?: string; allLocations?: string[] };
  description?: string; descriptionPlain?: string; lists?: { text: string; content: string }[]; additional?: string;
  salaryRange?: { min?: number; max?: number; currency?: string; interval?: string };
  country?: string;
}[];

export async function fetchLever(site: string, f: FetchLike = fetch): Promise<BoardResult> {
  // Lever hosts EU accounts on a separate API (api.eu.lever.co); a board that moved there answers 404 on the U.S. one.
  const path = `/v0/postings/${encodeURIComponent(site)}?mode=json`;
  const data = await getJson<LV>(f, `https://api.lever.co${path}`).catch((e) => {
    if (e instanceof BoardNotFound) return getJson<LV>(f, `https://api.eu.lever.co${path}`);
    throw e;
  });
  if (!Array.isArray(data)) throw new Error("Unexpected Lever response");
  const postings: RawPosting[] = data.filter((j) => j.text?.trim() && j.hostedUrl).map((j) => {
    const html = [j.description || "", ...(j.lists || []).map((l) => `<h3>${l.text}</h3><ul>${l.content}</ul>`), j.additional || ""].join("\n");
    const annual = j.salaryRange && (j.salaryRange.interval || "").toLowerCase().includes("year") && (j.salaryRange.currency || "USD") === "USD";
    return {
      provider: "LEVER" as const,
      externalId: `${site}:${j.id}`,
      title: j.text.trim(),
      department: j.categories?.team || j.categories?.department || null,
      location: j.categories?.location || null,
      workplaceType: j.workplaceType || null,
      isRemote: j.workplaceType === "remote",
      descriptionHtml: html,
      applyUrl: j.hostedUrl,
      postedAt: j.createdAt ? new Date(j.createdAt) : null,
      comp: annual ? { salaryMin: j.salaryRange!.min, salaryMax: j.salaryRange!.max, summary: `$${j.salaryRange!.min?.toLocaleString()}–$${j.salaryRange!.max?.toLocaleString()} (Lever salary range)` } : null,
    };
  });
  return { postings, total: postings.length };
}
