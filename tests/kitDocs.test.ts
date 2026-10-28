import { describe, expect, it, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { kitDocIds, libraryOnly } from "@/lib/kitDocs";
import { testDb, makeCompany } from "./setup-db";

describe("kit documents stay with their company", () => {
  let db: PrismaClient;
  beforeAll(() => { db = testDb(); });
  afterAll(() => db.$disconnect());

  const doc = (kind: string, isTailored = false) => db.document.create({ data: { kind, name: `${kind} ${Math.random()}`, fileName: "d.txt", mimeType: "text/plain", size: 1, sha256: "x", data: Buffer.from("x"), text: "x", isTailored } });
  async function kitFor(name: string) {
    const c = await makeCompany(db, { name });
    const job = await db.job.create({ data: { companyId: c.id, fingerprint: `kd-${Math.random()}`, title: "AE", applyUrl: "https://example.com/j" } });
    const [resume, letter] = [await doc("resume", true), await doc("cover_letter", true)];
    await db.kit.create({ data: { jobId: job.id, resumeDocId: resume.id, letterDocId: letter.id, parts: {}, checks: {}, model: "test" } });
    return { job, resume, letter };
  }

  it("keeps kit resumes and letters out of the library, but not her own versions", async () => {
    const original = await doc("resume");
    const ownVersion = await doc("resume", true);
    const { resume, letter } = await kitFor("Kitdocs A");
    const shown = libraryOnly([original, ownVersion, resume, letter], await kitDocIds(db)).map((d) => d.id);
    expect(shown).toEqual([original.id, ownVersion.id]);
  });

  it("lists this job's kit documents on its application, and not another company's", async () => {
    const mine = await kitFor("Kitdocs B");
    const theirs = await kitFor("Kitdocs C");
    const all = [mine.resume, mine.letter, theirs.resume, theirs.letter];
    const shown = libraryOnly(all, await kitDocIds(db), await kitDocIds(db, { jobId: mine.job.id })).map((d) => d.id);
    expect(shown).toEqual([mine.resume.id, mine.letter.id]);
  });
});
