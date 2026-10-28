// Resumes and letters written by Application Kits belong to their company and application, not the Resume Library.
import type { Prisma, PrismaClient } from "@prisma/client";

/** Ids of the documents saved by kits matching `where` (all kits by default). */
export async function kitDocIds(db: PrismaClient, where: Prisma.KitWhereInput = {}) {
  const kits = await db.kit.findMany({ where, select: { resumeDocId: true, letterDocId: true } });
  return new Set(kits.flatMap((k) => [k.resumeDocId, k.letterDocId]).filter((x): x is string => !!x));
}

/** Library documents, plus the kit documents in `keep` (for example, the ones written for this job). */
export function libraryOnly<T extends { id: string }>(docs: T[], kitDocs: Set<string>, keep: Iterable<string | null | undefined> = []) {
  const kept = new Set(keep);
  return docs.filter((d) => !kitDocs.has(d.id) || kept.has(d.id));
}
