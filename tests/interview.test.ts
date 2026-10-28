import { describe, expect, it, vi, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";

const create = vi.fn(async (_req: unknown) => ({ stop_reason: "end_turn", content: [{ type: "text", text: "Tell me about your pipeline." }] }));
vi.mock("@anthropic-ai/sdk", () => ({ default: class { beta = { messages: { create } }; } }));
// loadInterview reads through the app's shared client; point it at the test database.
vi.mock("@/lib/db", async () => ({ prisma: (await import("./setup-db")).testDb() }));

import { MOCK_OPENER, loadInterview, mockTurn, writeFollowup } from "@/lib/interview";
import { exportAll, restoreAll } from "@/lib/backup";
import { prisma } from "@/lib/db";
import { makeCompany } from "./setup-db";

type Req = { system: { text: string }[]; messages: { role: string; content: string }[] };
const lastReq = () => create.mock.calls.at(-1)![0] as unknown as Req;
const words = (n: number, w: string) => `${w} `.repeat(n);

describe("interview prep", () => {
  let db: PrismaClient;
  beforeAll(() => { db = prisma; });
  afterAll(() => db.$disconnect());

  async function setup() {
    const c = await makeCompany(db, { name: "Prepco" });
    const job = await db.job.create({ data: { companyId: c.id, fingerprint: `prep-${Math.random()}`, title: "Enterprise AE", applyUrl: "https://example.com/jobs/2", descriptionText: "Own a $2M quota." } });
    const doc = (text: string, isTailored = false) => db.document.create({ data: { kind: "resume", name: `R ${Math.random()}`, fileName: "r.txt", mimeType: "text/plain", size: 1, sha256: "x", data: Buffer.from("x"), text, isTailored } });
    return { c, job, doc };
  }

  it("prefers the resume submitted on the application, and carries the kit's point of view", async () => {
    const { c, job, doc } = await setup();
    await doc(words(120, "original"));
    const submitted = await doc(words(120, "submitted"), true);
    await db.kit.create({ data: { jobId: job.id, parts: { pov: "THE PROBLEM\nStalled public sector pipeline." }, checks: {}, model: "test" } });
    const app = await db.application.create({ data: { companyId: c.id, jobId: job.id, title: job.title, resumeId: submitted.id, hiringManagerName: "Dana Lee", interviewNotes: "Dana wants SLED logos." } });
    const { resumeText, context } = await loadInterview(app.id);
    expect(resumeText).toContain("submitted");
    expect(context).toContain("Stalled public sector pipeline.");
    expect(context).toContain("Hiring manager: Dana Lee.");
    expect(context).toContain("Dana wants SLED logos.");
    expect(context).toContain("Own a $2M quota.");
  });

  it("runs the mock interview as the chosen persona over the cached context and her answers", async () => {
    const history = [{ role: "user" as const, content: MOCK_OPENER }, { role: "assistant" as const, content: "Walk me through your best deal." }, { role: "user" as const, content: "I closed $8.5M last year." }];
    await mockTurn("hiring_manager", "Prepco", "Enterprise AE", "CONTEXT", history);
    const req = lastReq();
    expect(req.system[0].text).toContain("hiring manager at Prepco");
    expect(req.system[0].text).toContain("FEEDBACK");
    expect(req.system[1]).toMatchObject({ text: "CONTEXT", cache_control: { type: "ephemeral" } });
    expect(req.messages).toEqual(history);
  });

  it("writes the follow-up from her notes", async () => {
    await writeFollowup("recruiter", "They need a SLED rep by Q1.", "CONTEXT");
    expect(lastReq().messages[0].content).toContain("They need a SLED rep by Q1.");
    expect(lastReq().messages[0].content).toContain("recruiter");
  });

  it("survives a full backup and replace", async () => {
    const { c } = await setup();
    const app = await db.application.create({ data: { companyId: c.id, title: "AE" } });
    const prep = await db.interviewPrep.create({ data: { applicationId: app.id, kind: "mock", persona: "hr", messages: [{ role: "user", content: MOCK_OPENER }] } });
    const backup = JSON.parse(JSON.stringify(await exportAll(db)));
    await restoreAll(db, backup, "replace");
    const back = await db.interviewPrep.findUniqueOrThrow({ where: { id: prep.id } });
    expect(back.messages).toEqual([{ role: "user", content: MOCK_OPENER }]);
  });
});
