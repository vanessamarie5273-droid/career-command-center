// Link integrity: a job link must point at the specific posting, never a generic careers homepage.

export function isSpecificJobUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  const p = u.pathname.replace(/\/+$/, "");
  const host = u.hostname;
  if (/greenhouse\.io$/.test(host)) return /\/jobs\/\d+/.test(p) || u.searchParams.has("gh_jid");
  if (/lever\.co$/.test(host)) return /^\/[^/]+\/[0-9a-f-]{36}/.test(p);
  if (/ashbyhq\.com$/.test(host)) return /^\/[^/]+\/[0-9a-f-]{36}/.test(p);
  if (/smartrecruiters\.com$/.test(host)) return /\/\d{6,}|[0-9a-f-]{36}/.test(p);
  if (/myworkdayjobs\.com$/.test(host)) return /\/job\//.test(p);
  if (u.searchParams.has("gh_jid") || u.searchParams.has("jobId") || u.searchParams.has("jid")) return true;
  // Generic careers pages look like /careers, /jobs, /careers/search … with no identifier
  if (/^(\/[a-z-]{0,6})?\/(careers?|jobs?|join(-us)?|work-with-us|open-positions?)(\/(search|all|openings|list))?$/i.test(p) || p === "") return false;
  return /\d{4,}|[0-9a-f]{8}-[0-9a-f]{4}|\/(job|jobs|position|posting|careers?)\/[^/]+/.test(p);
}
