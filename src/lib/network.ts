// My Network: her LinkedIn connections, linked to the companies she tracks and the roles open there,
// so she can see who to ask about an opening and reach out from one place.
import type { PrismaClient } from "@prisma/client";
import { companyKey, legacyMatchCompany, matchCompany } from "./linkedin";
import { MATCHING } from "./queries";
import { STAGE_LABEL } from "./format";
import type { PersonType } from "./referral";

export { PERSON_LABEL, referralNote, type PersonType } from "./referral";
/** Who to ask first about an opening: the recruiter knows the search, the sales leader may own the hire. */
const ASK_ORDER: Record<PersonType, number> = { recruiter: 0, leader: 1, exec: 2, sales: 3, other: 4 };


const RECRUITING = /\b(recruit\w*|talent|sourc(er|ing)|people (partner|operations|ops)|human resources|hr|hrbp|staffing|hiring)\b/i;
const EXEC = /\b(ceo|coo|cro|cfo|cto|cmo|cio|chief|founder|co-?founder|owner|managing (director|partner)|general manager|evp|svp|executive vice president|senior vice president)\b|(^|[^e] )president\b/i;
const LEADS = /\b(vp|vice president|avp|rvp|director|head|manager|lead|leader|supervisor)\b/i;
const IC_MANAGER = /\b(account|territory|partner|channel|customer success|client|alliances?|product|key account) manager\b/gi;
const SELLING = /\b(sales|revenue|business development|bdr|bdrs|sdr|sdrs|account (executive|manager|director|lead)|ae|go[- ]to[- ]market|gtm|commercial|partnerships?|alliances|channel|customer success|presales|pre-sales|solutions? (engineer|consultant|architect)|territory|enterprise|growth|client (partner|director|executive))\b/i;

export function personType(title: string | null | undefined): PersonType {
  const t = (title ?? "").trim();
  if (!t) return "other";
  if (RECRUITING.test(t)) return "recruiter";
  if (EXEC.test(t)) return "exec";
  // "Account Manager" and its kin are individual sellers, not people managers.
  if (SELLING.test(t)) return LEADS.test(t.replace(IC_MANAGER, "")) ? "leader" : "sales";
  if (/\b(vp|vice president|head of)\b/i.test(t)) return "exec";
  return "other";
}

type Co = { id: string; name: string };
type LinkFields = { source: string; companyName: string | null; companyId: string | null };

/**
 * The tracked company a connection works at. Imported connections follow the current matcher, so a company she adds
 * later picks up its connections at once. A link she set by hand on the contact (one the importer would not have made) is kept.
 */
export function effectiveCompanyId(c: LinkFields, companies: Co[]): string | null {
  if (c.source !== "linkedin_export") return c.companyId;
  const now = matchCompany(c.companyName, companies)?.id ?? null;
  if (!c.companyId) return now;
  const byImporter = c.companyId === legacyMatchCompany(c.companyName, companies)?.id || c.companyId === now;
  return byImporter ? now : c.companyId;
}

/** Saves effectiveCompanyId on every imported connection whose link changed. Returns how many moved. */
export async function relinkContacts(db: PrismaClient) {
  const [companies, contacts] = await Promise.all([
    db.company.findMany({ select: { id: true, name: true } }),
    db.contact.findMany({ where: { source: "linkedin_export" }, select: { id: true, source: true, companyName: true, companyId: true } }),
  ]);
  let moved = 0;
  for (const c of contacts) {
    const id = effectiveCompanyId(c, companies);
    if (id !== c.companyId) { await db.contact.update({ where: { id: c.id }, data: { companyId: id } }); moved++; }
  }
  return moved;
}

export type NetRole = { id: string; title: string; score: number | null; applyUrl: string };
export type NetApp = { id: string; title: string; stage: string; applied: boolean };
export type NetPerson = {
  id: string; name: string; first: string; title: string | null; companyName: string | null; key: string; linkedinUrl: string | null; email: string | null;
  type: PersonType; connectedOn: Date | null; companyId: string | null;
  lastTouch: { sentAt: Date; replied: boolean; channel: string } | null; touches: number;
};
export type NetCompany = { id: string; name: string; logoUrl: string | null; growthScore: number | null; roles: NetRole[]; openRoles: number; apps: NetApp[] };

export async function loadNetwork(db: PrismaClient) {
  const [contacts, companies] = await Promise.all([
    db.contact.findMany({
      select: { id: true, firstName: true, lastName: true, title: true, companyName: true, companyId: true, source: true, linkedinUrl: true, email: true, connectedOn: true, createdAt: true, company: { select: { name: true } }, touches: { orderBy: { sentAt: "desc" }, select: { sentAt: true, replied: true, channel: true } } },
    }),
    db.company.findMany({ select: { id: true, name: true } }),
  ]);
  const people: NetPerson[] = contacts.map((c) => {
    const companyId = effectiveCompanyId(c, companies);
    const companyName = c.companyName ?? c.company?.name ?? null;
    return {
      id: c.id, name: `${c.firstName} ${c.lastName ?? ""}`.trim(), first: c.firstName, title: c.title, companyName, key: companyKey(companyName), linkedinUrl: c.linkedinUrl, email: c.email,
      type: personType(c.title), connectedOn: c.connectedOn ?? null, companyId,
      lastTouch: c.touches[0] ?? null, touches: c.touches.length,
    };
  });
  const ids = [...new Set(people.map((p) => p.companyId).filter((x): x is string => !!x))];
  const [cos, jobs, apps] = ids.length ? await Promise.all([
    db.company.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, logoUrl: true, growthScore: true } }),
    db.job.findMany({ where: { ...MATCHING, companyId: { in: ids } }, select: { id: true, title: true, score: true, applyUrl: true, companyId: true }, orderBy: [{ score: { sort: "desc", nulls: "last" } }, { postedAt: { sort: "desc", nulls: "last" } }] }),
    db.application.findMany({ where: { companyId: { in: ids }, stage: { notIn: ["REJECTED", "WITHDRAWN", "ACCEPTED"] } }, select: { id: true, title: true, stage: true, applied: true, companyId: true }, orderBy: { updatedAt: "desc" } }),
  ]) : [[], [], []];
  const byCo = new Map<string, NetCompany>(cos.map((c) => [c.id, { ...c, roles: [], openRoles: 0, apps: [] }]));
  for (const j of jobs) { const c = byCo.get(j.companyId)!; c.openRoles++; if (c.roles.length < 3) c.roles.push(j); }
  for (const a of apps) byCo.get(a.companyId)?.apps.push(a);
  return { people, companies: byCo };
}

export const isHiring = (c: NetCompany | undefined) => !!c && (c.openRoles > 0 || c.apps.length > 0);

/** Sort for "who should I ask first": hiring companies, then target accounts, then recruiter → sales leader → executive → peer. */
export function askFirst(companies: Map<string, NetCompany>) {
  const rank = (p: NetPerson) => {
    const co = p.companyId ? companies.get(p.companyId) : undefined;
    return (isHiring(co) ? 0 : co ? 10 : 20) + ASK_ORDER[p.type];
  };
  return (a: NetPerson, b: NetPerson) => rank(a) - rank(b) || (b.connectedOn?.getTime() ?? 0) - (a.connectedOn?.getTime() ?? 0);
}

export function appLabel(a: NetApp) {
  return !a.applied ? "Ready to Apply" : a.stage === "APPLIED" ? "Applied" : `Applied · ${STAGE_LABEL[a.stage as keyof typeof STAGE_LABEL] ?? a.stage}`;
}
