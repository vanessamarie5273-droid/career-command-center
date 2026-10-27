// Normalisation of raw ATS postings: text, location, compensation, requirements.

const STATE_NAMES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO", connecticut: "CT", delaware: "DE",
  florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY",
  louisiana: "LA", maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS", missouri: "MO",
  montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
  "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI",
  "south carolina": "SC", "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT", virginia: "VA",
  washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY", "district of columbia": "DC",
};
const STATE_CODES = new Set(Object.values(STATE_NAMES));
const US_CITIES = ["new york", "san francisco", "seattle", "austin", "boston", "chicago", "los angeles", "denver", "atlanta", "dallas", "phoenix", "scottsdale", "miami", "washington", "palo alto", "mountain view", "san jose", "salt lake", "las vegas", "nyc", "sf bay", "bay area", "san diego", "houston", "reston", "arlington", "raleigh", "nashville", "minneapolis", "philadelphia", "portland", "charlotte", "detroit", "pittsburgh", "tempe"];
// The state each listed city sits in, so "Boston" or "NYC" alone still places a role.
const CITY_STATE: Record<string, string> = {
  "new york": "NY", nyc: "NY", "san francisco": "CA", "sf bay": "CA", "bay area": "CA", seattle: "WA", austin: "TX", boston: "MA", chicago: "IL",
  "los angeles": "CA", denver: "CO", atlanta: "GA", dallas: "TX", phoenix: "AZ", scottsdale: "AZ", tempe: "AZ", miami: "FL", "palo alto": "CA",
  "mountain view": "CA", "san jose": "CA", "san diego": "CA", "salt lake": "UT", "las vegas": "NV", houston: "TX", reston: "VA", arlington: "VA",
  raleigh: "NC", nashville: "TN", minneapolis: "MN", philadelphia: "PA", portland: "OR", charlotte: "NC", detroit: "MI", pittsburgh: "PA",
};
const NON_US = ["canada", "toronto", "vancouver", "montreal", "london", "uk", "united kingdom", "ireland", "dublin", "germany", "berlin", "munich", "france", "paris", "netherlands", "amsterdam", "spain", "madrid", "barcelona", "italy", "milan", "india", "bangalore", "bengaluru", "hyderabad", "mumbai", "pune", "singapore", "japan", "tokyo", "australia", "sydney", "melbourne", "brazil", "são paulo", "sao paulo", "mexico", "israel", "tel aviv", "poland", "warsaw", "sweden", "stockholm", "switzerland", "zurich", "korea", "seoul", "emea", "apac", "latam", "anz", "dach", "nordics", "benelux", "uae", "dubai", "saudi", "riyadh", "south africa", "new zealand", "belgium", "denmark", "copenhagen", "norway", "finland", "portugal", "lisbon", "czech", "romania", "argentina", "colombia", "chile", "philippines", "indonesia", "malaysia", "thailand", "vietnam", "hong kong", "china", "taiwan", "costa rica"];

export function htmlToText(html: string | null | undefined): string {
  if (!html) return "";
  let s = html;
  // Greenhouse returns entity-encoded HTML
  if (/&lt;\w/.test(s)) s = decodeEntities(s);
  s = s
    .replace(/<\s*(br|\/p|\/div|\/li|\/h\d|\/tr)\s*\/?>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "\n• ")
    .replace(/<[^>]+>/g, " ");
  s = decodeEntities(s);
  return s.replace(/[ \t ]+/g, " ").replace(/\n\s*\n\s*\n+/g, "\n\n").replace(/ *\n */g, "\n").trim();
}

export function decodeEntities(s: string) {
  return s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ").replace(/&mdash;/g, "—").replace(/&ndash;/g, "–").replace(/&rsquo;/g, "’").replace(/&lsquo;/g, "‘")
    .replace(/&ldquo;/g, "“").replace(/&rdquo;/g, "”").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&");
}

export type LocationInfo = { isRemote: boolean; isUS: boolean; states: string[]; arrangement: "Remote" | "Hybrid" | "Onsite" | "Unknown"; azMetro: boolean };

export function parseLocation(loc: string | null | undefined, extra: { remoteFlag?: boolean; workplaceType?: string | null; text?: string } = {}): LocationInfo {
  const l = (loc || "").toLowerCase();
  const states = new Set<string>();
  for (const [name, code] of Object.entries(STATE_NAMES)) if (new RegExp(`\\b${name}\\b`).test(l)) states.add(code);
  for (const m of (loc || "").matchAll(/(?:,|\s|^)([A-Z]{2})(?=\b|$)/g)) if (STATE_CODES.has(m[1])) states.add(m[1]);
  for (const [city, code] of Object.entries(CITY_STATE)) if (new RegExp(`\\b${city}\\b`).test(l)) states.add(code);
  if (/washington,?\s*d\.?c\b/.test(l)) { states.delete("WA"); states.add("DC"); }
  const wt = (extra.workplaceType || "").toLowerCase();
  const isRemote = !!extra.remoteFlag || /remote|anywhere|distributed|work from home|wfh/.test(l) || wt === "remote";
  const hybrid = /hybrid/.test(l) || wt === "hybrid";
  const mentionsUS = /\b(us|u\.s\.|usa|united states|north america|americas|nationwide)\b/.test(l) || states.size > 0 || US_CITIES.some((c) => l.includes(c));
  const mentionsNonUS = NON_US.some((c) => new RegExp(`(^|[^a-z])${c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`).test(l));
  const isUS = mentionsUS || (!mentionsNonUS && (isRemote || l === ""));
  const azMetro = /phoenix|scottsdale|tempe|mesa|chandler|gilbert|arizona|\baz\b/.test(l);
  if (/arizona|\baz\b/.test(l)) states.add("AZ");
  const arrangement = isRemote && !hybrid ? "Remote" : hybrid ? "Hybrid" : loc ? "Onsite" : "Unknown";
  return { isRemote: isRemote && !hybrid, isUS: isUS && !(mentionsNonUS && !mentionsUS), states: [...states], arrangement, azMetro };
}

export type Comp = { salaryMin?: number; salaryMax?: number; oteMin?: number; oteMax?: number; text?: string };

function toNum(raw: string, k?: string): number {
  const n = Number(raw.replace(/[,\s]/g, ""));
  return k && /k/i.test(k) ? n * 1000 : n;
}

/** Extract published USD pay ranges. Distinguishes OTE / on-target from base when the posting says so. */
export function parseCompensation(text: string): Comp {
  if (!text) return {};
  const out: Comp = {};
  const re = /\$\s?(\d{2,3}(?:,\d{3})+|\d{2,3}(?:\.\d+)?\s?[kK]|\d{5,7})(?:\s?(?:USD))?\s*(?:-|–|—|to)\s*(?:USD\s*)?\$?\s?(\d{2,3}(?:,\d{3})+|\d{2,3}(?:\.\d+)?\s?[kK]|\d{5,7})/g;
  const found: { min: number; max: number; ctx: string; snippet: string }[] = [];
  for (const m of text.matchAll(re)) {
    const kA = /k/i.test(m[1]) ? "k" : undefined;
    const kB = /k/i.test(m[2]) ? "k" : undefined;
    const min = toNum(m[1].replace(/k/i, ""), kA);
    const max = toNum(m[2].replace(/k/i, ""), kB);
    if (min < 40000 || max > 2_000_000 || max < min) continue; // ignore hourly or nonsense
    const start = Math.max(0, (m.index ?? 0) - 220);
    const ctx = text.slice(start, (m.index ?? 0) + m[0].length + 60).toLowerCase();
    found.push({ min, max, ctx, snippet: text.slice(Math.max(0, (m.index ?? 0) - 120), (m.index ?? 0) + m[0].length + 40).replace(/\s+/g, " ").trim() });
  }
  for (const f of found) {
    const isOte = /\bote\b|on[- ]target|total target|target (total )?(cash|compensation|earnings)|ttc|including (variable|commission)/.test(f.ctx);
    const isBase = /base (salary|pay|compensation)|annual base|base range|salary range/.test(f.ctx) && !/\bote\b|on[- ]target/.test(f.ctx.slice(-120));
    if (isOte && out.oteMin == null) { out.oteMin = f.min; out.oteMax = f.max; }
    else if ((isBase || !isOte) && out.salaryMin == null) { out.salaryMin = f.min; out.salaryMax = f.max; }
  }
  // Many sales postings state a single range that is OTE when the posting is a quota-carrying role
  if (found.length) out.text = found.map((f) => f.snippet).slice(0, 3).join(" … ");
  return out;
}

export function parseYearsRequired(text: string): number | undefined {
  const m = text.match(/(\d{1,2})\s*\+?\s*(?:or more\s*)?years?(?:’|')?\s*(?:of\s+)?(?:[a-z\-/ ]{0,40})?(?:experience|selling|sales|quota)/i);
  if (!m) return undefined;
  const n = Number(m[1]);
  return n > 0 && n < 30 ? n : undefined;
}

export function requiresClearance(text: string): boolean {
  const t = text.toLowerCase();
  if (/(no|not)\s+(security\s+)?clearance\s+(is\s+)?required/.test(t)) return false;
  return /(active|current|existing|must (hold|have|possess)|requires?( an?)?)\s+(an?\s+)?(u\.?s\.?\s+)?(government\s+)?(ts\/sci|top secret|secret|security|dod|public trust)\s*(\/sci)?\s*clearance/.test(t) ||
    /clearance (is )?required/.test(t) || /(ts\/sci|top secret) (clearance )?(required|with polygraph)/.test(t);
}

/** Split requirements vs preferred sections, best-effort. */
export function splitQualifications(text: string): { required?: string; preferred?: string } {
  const lines = text.split("\n");
  let mode: "none" | "req" | "pref" = "none";
  const req: string[] = [], pref: string[] = [];
  for (const raw of lines) {
    const l = raw.trim();
    if (!l) continue;
    const low = l.toLowerCase();
    if (l.length < 90 && /(nice to have|preferred|bonus points|plus if|extra credit|would be great)/.test(low)) { mode = "pref"; continue; }
    if (l.length < 90 && /(requirements|qualifications|what you('ll)? bring|what we('re)? looking for|you have|about you|must have|who you are|minimum)/.test(low)) { mode = "req"; continue; }
    if (l.length < 60 && /^(benefits|perks|about us|compensation|what we offer|why join|our benefits|the team)/.test(low)) { mode = "none"; continue; }
    if (mode === "req" && req.length < 18) req.push(l);
    if (mode === "pref" && pref.length < 12) pref.push(l);
  }
  return { required: req.join("\n") || undefined, preferred: pref.join("\n") || undefined };
}

export function extractTravel(text: string): string | undefined {
  const m = text.match(/[^.\n]{0,80}\btravel\b[^.\n]{0,100}/i);
  return m ? m[0].trim() : undefined;
}

export function extractRelocation(text: string): string | undefined {
  const m = text.match(/[^.\n]{0,80}\b(relocat\w+|must (live|reside) (in|within|near))\b[^.\n]{0,100}/i);
  return m ? m[0].trim() : undefined;
}

export function extractTerritory(title: string, text: string): string | undefined {
  const t = `${title} ${text.slice(0, 1500)}`;
  const m = t.match(/\b(south ?west|west(ern)?|mountain|pacific northwest|northwest|central|east(ern)?|northeast|southeast|mid-?atlantic|great lakes|rockies|sled|state (and|&) local|federal|public sector|healthcare|enterprise|strategic|commercial|mid-?market|majors?|global accounts|north america|amer|named accounts)\b(?:[\s\-–,]*(region|territory|accounts?))?/i);
  return m ? m[0].trim().replace(/\s+/g, " ") : undefined;
}
