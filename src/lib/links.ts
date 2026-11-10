// Link integrity: a job link must point at the specific posting, never a generic careers homepage.
// The check has to accept every real posting link she pastes from any job site, so it rejects only
// what clearly isn't one posting: a site root, a careers or jobs landing page, a search page, or an ATS board root.

// Query parameters that carry a posting's id on common job sites (Greenhouse, Taleo, iCIMS, SuccessFactors,
// Indeed, LinkedIn, Eightfold, ADP, Dayforce …).
const ID_PARAMS = new Set(["gh_jid", "jobid", "job_id", "jid", "jk", "vjk", "job", "jobreqid", "req", "reqid", "req_id", "requisitionid",
  "career_job_req_id", "currentjobid", "postingid", "positionid", "pid", "token", "jobpostingid", "jobcode", "opportunityid", "id"]);
const hasIdParam = (u: URL) => [...u.searchParams].some(([k, v]) => ID_PARAMS.has(k.toLowerCase()) && /[a-z0-9]{2,}/i.test(v));

// A segment that names one posting: a long number, a UUID, or a requisition id like JR-0111232, R12345, REQ-1234.
const ID_TOKEN = /\d{4,}|[0-9a-f]{8}-[0-9a-f]{4}|(^|[^a-z])(jr|r|req|job)[-_]?\d{3,}/i;
// Path words that mean "the next segment is one posting".
const POSTING_WORD = /\/(job|jobs|position|positions|posting|postings|details?|opening|openings|vacancy|vacancies|role|roles|requisitions?|careers?|j|o|view|apply)\/[^/]+/i;
// Landing and search pages: /careers, /en-us/jobs, /careers/search, /jobs/search-results …
const LANDING = /^(\/[a-z]{2}([-_][a-z]{2})?)?(\/[a-z-]{0,20})?\/(careers?|jobs?|join(-us)?|work-with-us|open-positions?|opportunities|openings)(\/(search|search-results|results|all|openings|list|index|home|listings?))?$/i;
const SEARCH_END = /\/(search|search-results|results|listings?)$/i;

export function isSpecificJobUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  let u: URL;
  try { u = new URL(url.trim()); } catch { return false; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  const p = u.pathname.replace(/\/+$/, "");
  const host = u.hostname.toLowerCase();
  if (/greenhouse\.io$/.test(host)) return /\/jobs\/\d+/.test(p) || u.searchParams.has("gh_jid") || u.searchParams.has("token");
  if (/lever\.co$/.test(host)) return /^\/[^/]+\/[0-9a-f-]{36}/.test(p);
  if (/ashbyhq\.com$/.test(host)) return /^\/[^/]+\/[0-9a-f-]{36}/.test(p);
  if (/smartrecruiters\.com$/.test(host)) return /\/\d{6,}|[0-9a-f-]{36}/.test(p);
  // Workday postings live under /job/… (older links) or /details/… (the current site), and end in a req id.
  if (/myworkdayjobs\.com$|myworkdaysite\.com$/.test(host)) return /\/(job|details)\/[^/]+/i.test(p) || /_[a-z]*-?\d{3,}$/i.test(p);
  if (hasIdParam(u)) return true;
  if (p === "" || LANDING.test(p) || SEARCH_END.test(p)) return false;
  return ID_TOKEN.test(p) || POSTING_WORD.test(p);
}
