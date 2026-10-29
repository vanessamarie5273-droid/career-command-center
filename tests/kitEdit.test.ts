import { describe, expect, it, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { saveKitPart } from "@/lib/kitEdit";
import type { KitChecks, KitParts } from "@/lib/kitParts";
import { testDb, makeCompany } from "./setup-db";

describe("editing a kit part", () => {
  let db: PrismaClient;
  beforeAll(() => { db = testDb(); });
  afterAll(() => db.$disconnect());

  const doc = (kind: string, text: string, isTailored = true) => db.document.create({ data: { kind, name: `${kind} ${Math.random()}`, fileName: "d.txt", mimeType: "text/plain", size: 1, sha256: "x", data: Buffer.from(text), text, isTailored } });

  async function kit() {
    const c = await makeCompany(db, { name: "Kitedit Co" });
    const job = await db.job.create({ data: { companyId: c.id, fingerprint: `ke-${Math.random()}`, title: "Account Executive", applyUrl: "https://example.com/j" } });
    const base = await doc("resume", "Vanessa\nAccount Executive at SAP for nine years. Closed $4M in new business.", false);
    const [resume, letter] = [await doc("resume", "old resume"), await doc("cover_letter", "old letter")];
    return db.kit.create({ data: { jobId: job.id, baseResumeId: base.id, resumeDocId: resume.id, letterDocId: letter.id, parts: { resume: "old resume", letter: "old letter", pov: "old pov" }, checks: { resume: [], letter: [], pov: [] }, model: "test" } });
  }

  it("saves the new letter into the kit and its saved document", async () => {
    const k = await kit();
    const text = "Dear Hiring Team,\n\nI am excited about Kitedit Co.\n\nSincerely,\nVanessa";
    const updated = await saveKitPart(db, k.id, "letter", text);
    expect((updated.parts as KitParts).letter).toBe(text);
    expect((updated.parts as KitParts).pov).toBe("old pov");
    const saved = await db.document.findUniqueOrThrow({ where: { id: k.letterDocId! } });
    expect(saved.text).toBe(text);
    expect(Buffer.from(saved.data).toString("utf8")).toBe(text);
    expect(saved.size).toBe(Buffer.byteLength(text));
  });

  it("re-runs the checks for the edited part only", async () => {
    const k = await kit();
    const updated = await saveKitPart(db, k.id, "resume", "Vanessa\nAccount Executive at Oracle. Closed $75M in new business.");
    const checks = updated.checks as KitChecks;
    expect(checks.resume.length).toBeGreaterThan(0);
    expect(checks.pov).toEqual([]);
    expect((await db.document.findUniqueOrThrow({ where: { id: k.resumeDocId! } })).atsReport).not.toBeNull();
  });

  it("leaves documents alone when a part has none", async () => {
    const k = await kit();
    await saveKitPart(db, k.id, "pov", "A new point of view.");
    expect((await db.document.findUniqueOrThrow({ where: { id: k.letterDocId! } })).text).toBe("old letter");
  });
});
