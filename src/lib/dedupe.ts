// One req, one entry. The same opening reaches the app from more than one place: the employer's own board, Google Jobs
// (often from two different searches), a second copy of the employer stored under another spelling, or the same Workday
// role read once with its details and once without. Each copy spells the location differently ("Phoenix, AZ",
// "Phoenix, Arizona, United States", "US-AZ-Phoenix", "2 Locations") and sometimes the title too ("Director, Sales
// Development" and "Sales Development Director"), so an exact match on title and location let copies through (Nov 28).
import { createHash } from "node:crypto";
import { STATE_CODES, STATE_NAMES, parseLocation } from "./normalize";

const TITLE_NOISE = /\b(remote|hybrid|us|usa|united states|north america|amer)\b/g;

export function normalizeTitle(t: string) {
  return t.toLowerCase()
    .replace(/\(.*?\)/g, " ").replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\bsr\b/g, "senior").replace(/\bmgr\b/g, "manager").replace(/\bdir\b/g, "director")
    .replace(/\bvp\b/g, "vice president").replace(/\bae\b/g, "account executive")
    .replace(TITLE_NOISE, " ").replace(/\s+/g, " ").trim();
}

const REMOTE = /remote|anywhere|work from home|\bwfh\b|virtual|home[- ]?based|distributed|telecommut/;
/** Words in a location that never tell two places apart. */
const PLACE_NOISE = /\b(united states of america|united states|usa|u s a|u s|us|north america|americas|amer|hybrid|on ?site|in office|office|field|metro(politan)? area|area|greater|city|hq|headquarters)\b/g;

/** One place in a location: a city ("phoenix"), a state code ("az") when no city is given, "remote", or "" when the
 *  text names no place at all ("United States", "2 Locations"). */
export function placeKey(piece: string): string {
  const low = piece.toLowerCase().trim();
  if (!low) return "";
  if (REMOTE.test(low)) return "remote";
  if (/\b\d+\s+locations?\b|multiple locations|various locations|several locations/.test(low)) return "";
  const segs = low.split(/[,()|–—]|\s-\s|-(?=[a-z])/).map((s) => s.replace(/\./g, "").replace(PLACE_NOISE, " ").replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim()).filter(Boolean);
  const stateCode = (s: string) => STATE_NAMES[s] ?? (s.length === 2 && STATE_CODES.has(s.toUpperCase()) ? s.toUpperCase() : "");
  // "New York, NY" and "Washington, DC": a city named like a state, followed by a state code.
  if (segs.length >= 2 && STATE_NAMES[segs[0]] && segs.slice(1).some((s) => s.length === 2 && stateCode(s))) return segs[0];
  let state = "";
  for (const s of segs) {
    const code = stateCode(s);
    if (code) { state ||= code.toLowerCase(); continue; }
    return s; // the first segment that is not a state or a country is the city
  }
  return state;
}

/** Every place a location names, e.g. "Phoenix, AZ; Remote - US" → ["phoenix", "remote"]. Empty when none is named. */
export function placeSet(l: string | null | undefined): string[] {
  if (!l) return [];
  return [...new Set(l.split(/;|\||\s\/\s|\bor\b/i).map(placeKey).filter(Boolean))].sort();
}

export function normalizeLocation(l: string | null | undefined) {
  return placeSet(l).join(";");
}

/** Same opening across sources ⇒ same fingerprint: company + normalized title + normalized location. */
export function jobFingerprint(companyId: string, title: string, location: string | null | undefined) {
  return createHash("sha1").update(`${companyId}|${normalizeTitle(title)}|${normalizeLocation(location)}`).digest("hex");
}

const TITLE_FILLER = new Set(["of", "the", "and", "for", "a", "an", "to", "in", "at", "with"]);
/** The words of a title in any order, without filler or the places the posting is in: "Director of Sales Development
 *  - Phoenix" and "Sales Development Director" share a key. Levels (I, II, Senior) and territories (West, Federal) stay. */
export function titleKey(title: string, location?: string | null) {
  let t = ` ${normalizeTitle(title)} `;
  for (const p of placeSet(location)) if (p !== "remote") t = t.replace(` ${p} `, " ");
  const words = t
    .replace(/\bacct\b/g, "account").replace(/\bexec\b/g, "executive").replace(/\bbiz dev\b|\bbd\b/g, "business development")
    .split(" ").filter((w) => w && !TITLE_FILLER.has(w));
  return [...new Set(words)].sort().join(" ");
}

/** A link without tracking parameters, so the employer's posting and Google's link to it compare equal. */
export function urlKey(u: string | null | undefined) {
  if (!u) return "";
  try {
    const x = new URL(u);
    for (const k of [...x.searchParams.keys()]) if (/^(utm_|gh_src|source|src|ref|lever-|ccuid|codes|iis|iisn|jobboard|mode)/i.test(k)) x.searchParams.delete(k);
    return `${x.hostname.replace(/^www\./, "")}${x.pathname.replace(/\/(apply|application)\/?$/i, "").replace(/\/+$/, "")}${x.search}`.toLowerCase();
  } catch { return u.trim().toLowerCase(); }
}

/** What two copies are compared on. googleOnly: every source is a Google Jobs result, whose location is a sample
 *  (one city of several, or the city searched for a remote role). */
export type ReqView = { title: string; location: string | null; providers: string[]; urls: string[] };

/** Everything sameReq compares, worked out once per job: a big employer has thousands of saved roles, and redoing
 *  the text work for every pair kept the first deploy of the dedupe busy for over 12 minutes (Nov 28). */
export type ReqKey = { title: string; places: string[]; placesKey: string; providers: string[]; urls: Set<string>; googleOnly: boolean; location: string | null; states?: string[] };

export function reqKey(v: ReqView): ReqKey {
  const places = placeSet(v.location);
  return {
    title: titleKey(v.title, v.location), places, placesKey: places.join(";"), providers: v.providers, location: v.location,
    urls: new Set(v.urls.map(urlKey).filter(Boolean)),
    googleOnly: v.providers.length > 0 && v.providers.every((p) => p === "GOOGLE_JOBS"),
  };
}
const statesOf = (k: ReqKey) => (k.states ??= parseLocation(k.location).states);

/** Is b the same opening as a, at the same company? Different cities on the employer's own board stay apart:
 *  those are separate reqs. */
export function sameReqKey(a: ReqKey, b: ReqKey): boolean {
  for (const u of b.urls) if (a.urls.has(u)) return true;
  if (a.title !== b.title) return false;
  const pa = a.places, pb = b.places;
  if (a.placesKey === b.placesKey) return true;
  // No place named on one side ("United States", "2 Locations", a Workday role read without its details).
  if (!pa.length || !pb.length) return true;
  if (a.googleOnly || b.googleOnly) {
    if (pa.some((p) => pb.includes(p)) || pa.includes("remote") || pb.includes("remote")) return true;
    const sa = statesOf(a);
    return statesOf(b).some((s) => sa.includes(s));
  }
  // The employer lists one role in several places and another board (or an older read) lists one of them.
  // Copies from one board must match exactly, or a refresh would swap the two locations back and forth.
  const sameBoard = a.providers.some((p) => b.providers.includes(p));
  if (sameBoard) return false;
  const [small, big] = pa.length <= pb.length ? [pa, pb] : [pb, pa];
  return small.every((p) => big.includes(p));
}

export const sameReq = (a: ReqView, b: ReqView) => sameReqKey(reqKey(a), reqKey(b));

export function contentHash(s: string) {
  return createHash("sha1").update(s).digest("hex").slice(0, 16);
}
