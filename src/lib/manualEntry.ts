// Adding a company or a role by hand: often one she heard about before it was posted
// (a comment on a LinkedIn post, a conversation, a referral), so the posting link is optional.
import type { PrismaClient } from "@prisma/client";

export const FOUND_VIA = {
  FEED: "LinkedIn post or comment",
  NETWORK: "Someone told me",
  REFERRAL: "Referral",
  LINKEDIN: "LinkedIn job posting",
  MANUAL: "Employer site",
} as const;
export type FoundVia = keyof typeof FOUND_VIA;
export const FOUND_VIA_KEYS = Object.keys(FOUND_VIA) as [FoundVia, ...FoundVia[]];

export const foundViaLabel = (k: string) => FOUND_VIA[k as FoundVia] ?? k.toLowerCase().replace(/_/g, " ");

export type ContactIn = { name: string; title?: string; linkedinUrl?: string };

/** Splits "Jane van Dyke" into first "Jane", last "van Dyke". */
export function splitName(name: string): { firstName: string; lastName: string | null } {
  const parts = name.trim().split(/\s+/);
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") || null };
}

const stamp = (d = new Date()) => d.toISOString().slice(0, 10);

/**
 * Records the person who mentioned the role or company in My Network, on that account.
 * Reuses the contact when her LinkedIn profile (or the same name at the same company) is already saved.
 */
export async function saveContact(db: PrismaClient, c: ContactIn, companyId: string, note: string, role?: string) {
  const { firstName, lastName } = splitName(c.name);
  const line = `${stamp()}: ${note}`;
  const existing = c.linkedinUrl
    ? await db.contact.findUnique({ where: { linkedinUrl: c.linkedinUrl } })
    : await db.contact.findFirst({ where: { companyId, firstName: { equals: firstName, mode: "insensitive" }, lastName: lastName ? { equals: lastName, mode: "insensitive" } : null } });
  if (existing) {
    return db.contact.update({ where: { id: existing.id }, data: {
      companyId: existing.companyId ?? companyId, title: existing.title ?? c.title ?? null, role: existing.role ?? role ?? null,
      notes: existing.notes ? `${existing.notes}\n${line}` : line,
    } });
  }
  return db.contact.create({ data: { firstName, lastName, title: c.title || null, linkedinUrl: c.linkedinUrl || null, companyId, role: role ?? null, source: "manual", notes: line } });
}

/** A note on the account's Notes & activity timeline. */
export async function addCompanyNote(db: PrismaClient, companyId: string, body: string) {
  await db.activity.create({ data: { companyId, kind: "note", body } });
}
