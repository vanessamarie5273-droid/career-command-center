import { createHash } from "node:crypto";

const TITLE_NOISE = /\b(remote|hybrid|us|usa|united states|north america|amer)\b/g;

export function normalizeTitle(t: string) {
  return t.toLowerCase()
    .replace(/\(.*?\)/g, " ").replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\bsr\b/g, "senior").replace(/\bmgr\b/g, "manager").replace(/\bdir\b/g, "director")
    .replace(/\bvp\b/g, "vice president").replace(/\bae\b/g, "account executive")
    .replace(TITLE_NOISE, " ").replace(/\s+/g, " ").trim();
}

export function normalizeLocation(l: string | null | undefined) {
  if (!l) return "";
  const low = l.toLowerCase();
  if (/remote/.test(low) && /\b(us|usa|united states|u\.s\.)\b/.test(low)) return "remote-us";
  return low.replace(/[^a-z;]/g, "").split(";").sort().join(";");
}

/** Same opening across sources ⇒ same fingerprint: company + normalized title + normalized location. */
export function jobFingerprint(companyId: string, title: string, location: string | null | undefined) {
  return createHash("sha1").update(`${companyId}|${normalizeTitle(title)}|${normalizeLocation(location)}`).digest("hex");
}

export function contentHash(s: string) {
  return createHash("sha1").update(s).digest("hex").slice(0, 16);
}
