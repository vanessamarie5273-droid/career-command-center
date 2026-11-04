// Adding a company to her accounts: from Accounts → Add company, or inline while adding a job by URL.
import type { PrismaClient } from "@prisma/client";

export type NewCompany = { name: string; website?: string; category: string; headquarters?: string; ownership?: string; description?: string; atsHint?: string };

export const companySlug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** The company's job board, read straight from a posting link, so its other openings feed in too. */
export function boardHintFromUrl(url: string): string | undefined {
  let u: URL;
  try { u = new URL(url); } catch { return undefined; }
  const host = u.hostname.toLowerCase();
  const seg = u.pathname.split("/").filter(Boolean);
  if (/(^|\.)greenhouse\.io$/.test(host)) {
    if (seg[0] && seg[0] !== "embed" && seg[1] === "jobs") return `greenhouse:${seg[0]}`;
    const t = u.searchParams.get("for");
    return t ? `greenhouse:${t}` : undefined;
  }
  if (host === "jobs.lever.co" && seg[0]) return `lever:${seg[0]}`;
  if (host === "jobs.ashbyhq.com" && seg[0]) return `ashby:${seg[0]}`;
  if (/^(jobs|careers)\.smartrecruiters\.com$/.test(host) && seg[0]) return `smartrecruiters:${seg[0]}`;
  const wd = host.match(/^([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com$/);
  if (wd) {
    const site = (/^[a-z]{2}-[A-Z]{2}$/.test(seg[0] ?? "") ? seg[1] : seg[0]);
    if (site && site !== "job") return `workday:${wd[1]}|${wd[2]}|${site}`;
  }
  return undefined;
}

const NOT_EMPLOYER = /(^|\.)(greenhouse\.io|lever\.co|ashbyhq\.com|smartrecruiters\.com|myworkdayjobs\.com|workable\.com|icims\.com|jobvite\.com|taleo\.net|oraclecloud\.com|successfactors\.com|bamboohr\.com|linkedin\.com|indeed\.com|glassdoor\.com|ziprecruiter\.com|google\.com|builtin\.com|wellfound\.com|dice\.com|monster\.com)$/;

/** The employer's own site when the posting lives on it (careers.acme.com/jobs/123 → https://acme.com). */
export function websiteFromUrl(url: string): string | undefined {
  let u: URL;
  try { u = new URL(url); } catch { return undefined; }
  const host = u.hostname.toLowerCase();
  if (NOT_EMPLOYER.test(host)) return undefined;
  return `https://${host.replace(/^(www|careers|jobs|apply|careers-[a-z0-9]+)\./, "")}`;
}

export async function findCompanyByName(db: PrismaClient, name: string) {
  const slug = companySlug(name);
  return (await db.company.findUnique({ where: { slug } })) ?? db.company.findFirst({ where: { name: { equals: name.trim(), mode: "insensitive" } } });
}

export async function createCompany(db: PrismaClient, b: NewCompany, userId: string) {
  const site = b.website?.replace(/\/$/, "");
  const host = site ? new URL(site).hostname.replace(/^www\./, "") : null;
  const c = await db.company.create({ data: {
    slug: companySlug(b.name), name: b.name.trim(), website: site ?? null, category: b.category, headquarters: b.headquarters, ownership: b.ownership, description: b.description,
    careersUrl: site ? `${site}/careers` : null, logoUrl: host ? `https://www.google.com/s2/favicons?domain=${host}&sz=128` : null,
    linkedinUrl: `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(b.name.trim())}`,
    profileFactType: "CONFIRMED", profileSource: "Entered by you", profileVerifiedAt: new Date(), atsHints: b.atsHint ? [b.atsHint] : [], addedBy: "user",
  } });
  await db.auditLog.create({ data: { userId, entity: "Company", entityId: c.id, action: "create", changes: b } });
  return c;
}
