// Resumes and letters written by Application Kits belong to their company and application, not the Resume Library.
import type { Prisma, PrismaClient } from "@prisma/client";

/** Ids of the documents saved by kits matching `where` (all kits by default), plus versions made from them. */
export async function kitDocIds(db: PrismaClient, where: Prisma.KitWhereInput = {}) {
  const kits = await db.kit.findMany({ where, select: { resumeDocId: true, letterDocId: true } });
  const ids = kits.flatMap((k) => [k.resumeDocId, k.letterDocId]).filter((x): x is string => !!x);
  const copies = ids.length ? await db.document.findMany({ where: { parentId: { in: ids } }, select: { id: true } }) : [];
  return new Set([...ids, ...copies.map((c) => c.id)]);
}

/** Library documents, plus the kit documents in `keep` (for example, the ones written for this job). */
export function libraryOnly<T extends { id: string }>(docs: T[], kitDocs: Set<string>, keep: Iterable<string | null | undefined> = []) {
  const kept = new Set(keep);
  return docs.filter((d) => !kitDocs.has(d.id) || kept.has(d.id));
}
