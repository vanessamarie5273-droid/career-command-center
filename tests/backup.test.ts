import { describe, expect, it, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { exportAll, restoreAll } from "@/lib/backup";
import { parseConnections, matchCompany } from "@/lib/linkedin";
import { testDb, makeCompany } from "./setup-db";

describe("backup and restore", () => {
  let db: PrismaClient;
  beforeAll(() => { db = testDb(); });
  afterAll(() => db.$disconnect());

  it("round-trips records and files through a full replace", async () => {
    const c = await makeCompany(db);
    const doc = await db.document.create({ data: { kind: "resume", name: "Resume", fileName: "r.txt", mimeType: "text/plain", size: 5, sha256: "x", data: Buffer.from("hello"), text: "hello" } });
    const app = await db.application.create({ data: { companyId: c.id, title: "Strategic AE", resumeId: doc.id, personalNotes: "keep me", documents: { connect: { id: doc.id } } } });
    const backup = JSON.parse(JSON.stringify(await exportAll(db)));
    await db.application.delete({ where: { id: app.id } });
    await restoreAll(db, backup, "replace");
    const back = await db.application.findUniqueOrThrow({ where: { id: app.id }, include: { documents: true, resume: true } });
    expect(back.personalNotes).toBe("keep me");
    expect(Buffer.from(back.resume!.data).toString()).toBe("hello");
    expect(back.documents).toHaveLength(1);
  });

  it("rejects files that are not backups", async () => {
    await expect(restoreAll(db, { foo: 1 } as never)).rejects.toThrow(/Not a Career Command Center backup/);
  });
});

describe("LinkedIn connections export", () => {
  const csv = `Notes:\n"When exporting your connection data, you may notice that some of the email addresses are missing."\n\nFirst Name,Last Name,URL,Email Address,Company,Position,Connected On\nJane,Doe,https://www.linkedin.com/in/janedoe,,Databricks Inc.,"Regional Vice President, Sales",12 Mar 2024\nJohn,Roe,https://www.linkedin.com/in/johnroe,,Acme Widgets,Buyer,01 Jan 2023\n`;
  it("parses the official format including the notes preamble and quoted commas", () => {
    const rows = parseConnections(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ firstName: "Jane", company: "Databricks Inc.", position: "Regional Vice President, Sales" });
  });
  it("matches connections to target companies by normalised name", () => {
    expect(matchCompany("Databricks Inc.", [{ id: "1", name: "Databricks" }])?.id).toBe("1");
    expect(matchCompany("Acme Widgets", [{ id: "1", name: "Databricks" }])).toBeNull();
  });
});
