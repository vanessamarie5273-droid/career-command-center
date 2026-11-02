// Makes sure a job has its full description before an Application Kit is written from it.
// A Greenhouse detail call can fail during the daily refresh, and some sources only give a snippet; a letter written
// from a title alone can only fall back on her resume, which is exactly the letter she does not want.
import type { PrismaClient } from "@prisma/client";
import { getJson, UA } from "./ingest/http";
import type { FetchLike } from "./ingest/types";
import { htmlToText, splitQualifications } from "./normalize";

export const FULL_POSTING_WORDS = 150;
const wordCount = (t: string | null | undefined) => (t ?? "").split(/\s+/).filter(Boolean).length;

/** The description a public job page publishes as schema.org JobPosting JSON-LD, which most career sites include. */
export function jsonLdDescription(html: string): string | null {
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(m[1].trim());
      const items: unknown[] = Array.isArray(data) ? data : data?.["@graph"] ?? [data];
      for (const it of items as { "@type"?: string | string[]; description?: unknown }[]) {
        const type = it?.["@type"];
        if ((type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"))) && typeof it.description === "string") return it.description;
      }
    } catch { /* not JSON, try the next block */ }
  }
  return null;
}

type Source = { provider: string; externalId: string; url: string };

async function fetchFull(applyUrl: string, sources: Source[], f: FetchLike): Promise<string | null> {
  for (const s of sources) {
    if (s.provider !== "GREENHOUSE") continue;
    const [token, id] = s.externalId.split(":");
    if (!token || !id) continue;
    const d = await getJson<{ content?: string }>(f, `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs/${encodeURIComponent(id)}`, {}, 2).catch(() => null);
    if (d?.content) return d.content;
  }
  for (const url of [...new Set([applyUrl, ...sources.map((s) => s.url)])]) {
    try {
      const res = await f(url, { headers: { "User-Agent": UA, Accept: "text/html" }, signal: AbortSignal.timeout(15000) });
      if (!res.ok) continue;
      const d = jsonLdDescription(await res.text());
      if (d) return d;
    } catch { /* unreachable page: try the next source */ }
  }
  return null;
}

/**
 * When a job has little or no description on file, fetches the full posting (Greenhouse detail, then the posting page),
 * or falls back to the description saved on her application, and stores it on the job. Never throws.
 * Returns how many words of description the job has afterwards.
 */
export async function ensureDescription(db: PrismaClient, jobId: string, f: FetchLike = fetch): Promise<number> {
  const job = await db.job.findUnique({ where: { id: jobId }, select: { descriptionText: true, applyUrl: true, sources: { select: { provider: true, externalId: true, url: true } }, applications: { select: { jdSnapshot: true } } } });
  if (!job) return 0;
  const have = wordCount(job.descriptionText);
  if (have >= FULL_POSTING_WORDS) return have;
  try {
    const html = await fetchFull(job.applyUrl, job.sources, f);
    const fetched = html ? htmlToText(html) : "";
    const snapshot = job.applications.map((a) => a.jdSnapshot ?? "").sort((a, b) => wordCount(b) - wordCount(a))[0] ?? "";
    const [text, fromHtml] = wordCount(fetched) >= wordCount(snapshot) ? [fetched, true] : [snapshot, false];
    if (wordCount(text) <= have) return have;
    const quals = splitQualifications(text);
    await db.job.update({ where: { id: jobId }, data: { descriptionText: text, ...(fromHtml ? { description: html } : {}), ...(quals.required ? { requiredQuals: quals.required } : {}), ...(quals.preferred ? { preferredQuals: quals.preferred } : {}) } });
    return wordCount(text);
  } catch {
    return have;
  }
}
