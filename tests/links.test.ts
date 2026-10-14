import { describe, expect, it, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { isSpecificJobUrl } from "@/lib/links";
import { ingestCompany } from "@/lib/ingest/run";
import { greenhouseBoard, ashbyBoard, mockFetch } from "./fixtures/boards";
import { testDb, makeCompany } from "./setup-db";

describe("link integrity", () => {
  it.each([
    "https://job-boards.greenhouse.io/databricks/jobs/7012345002",
    "https://boards.greenhouse.io/anthropic/jobs/4567890",
    "https://jobs.lever.co/veeva/0b9a7a2e-1111-2222-3333-444455556666",
    "https://jobs.ashbyhq.com/openai/0b9a7a2e-1111-2222-3333-444455556666",
    "https://workday.wd5.myworkdayjobs.com/Workday/job/USA-AZ-Remote/Strategic-AE_JR-12345",
    "https://www.example.com/careers?gh_jid=123456",
  ])("accepts specific posting %s", (u) => expect(isSpecificJobUrl(u)).toBe(true));
  it.each([
    "https://www.example.com/careers",
    "https://www.example.com/careers/",
    "https://www.example.com/jobs",
    "https://boards.greenhouse.io/databricks",
    "https://jobs.lever.co/veeva",
    "https://jobs.ashbyhq.com/openai",
    "not a url",
  ])("rejects generic page %s", (u) => expect(isSpecificJobUrl(u)).toBe(false));
});

describe("ingestion end to end (fixture feeds)", () => {
  let db: PrismaClient;
  beforeAll(() => { db = testDb(); });
  afterAll(() => db.$disconnect());

  it("stores only relevant US sales roles, each linking to its own posting", async () => {
    const c = await makeCompany(db);
    const f = mockFetch({ "boards-api.greenhouse.io/v1/boards/testco": greenhouseBoard([
      { id: 101, title: "Strategic Account Executive", location: "Remote - US" },
      { id: 102, title: "Senior Software Engineer", location: "Remote - US" },
      { id: 103, title: "Enterprise Account Executive", location: "London, UK" },
      { id: 104, title: "Director, Sales Development", location: "Phoenix, AZ" },
    ]) });
    const out = await ingestCompany(db, c, f);
    expect(out.status).toBe("ok");
    expect(out.relevant).toBe(2);
    const jobs = await db.job.findMany({ where: { companyId: c.id } });
    expect(jobs.map((j) => j.title).sort()).toEqual(["Director, Sales Development", "Strategic Account Executive"]);
    for (const j of jobs) expect(isSpecificJobUrl(j.applyUrl)).toBe(true);
    const ae = jobs.find((j) => j.title.startsWith("Strategic"))!;
    expect(ae.oteMax).toBe(340000);
    expect(ae.compFactType).toBe("CONFIRMED");
    expect((await db.company.findUniqueOrThrow({ where: { id: c.id } })).totalOpenings).toBe(44);
  });

  it("closes jobs that disappear, keeps them in history, and never closes on a failed fetch", async () => {
    const c = await makeCompany(db);
    let board: unknown = greenhouseBoard([{ id: 201, title: "Enterprise Account Executive", location: "Remote - US" }, { id: 202, title: "Account Director", location: "Remote - US" }]);
    const f = mockFetch({ "boards-api.greenhouse.io": () => board });
    await ingestCompany(db, c, f, new Date());
    board = 500;
    const failed = await ingestCompany(db, c, f, new Date());
    expect(failed.status).toBe("error");
    expect(await db.job.count({ where: { companyId: c.id, status: "OPEN" } })).toBe(2);
    board = greenhouseBoard([{ id: 201, title: "Enterprise Account Executive", location: "Remote - US" }]);
    const ok = await ingestCompany(db, c, f, new Date());
    expect(ok.closed).toBe(1);
    const closed = await db.job.findFirstOrThrow({ where: { companyId: c.id, status: "CLOSED" }, include: { events: true } });
    expect(closed.title).toBe("Account Director");
    expect(closed.events.map((e) => e.kind)).toContain("closed");
  });

  it("discovers an Ashby board when no provider is configured and reads structured pay", async () => {
    const c = await makeCompany(db, { atsProvider: "NONE", atsToken: null, slug: `ashco-${Date.now()}`, name: "AshCo", atsHints: [] });
    const f = mockFetch({ [`api.ashbyhq.com/posting-api/job-board/${c.slug}`]: ashbyBoard([{ id: "0b9a7a2e-1111-2222-3333-444455556666", title: "Enterprise Account Executive, Healthcare", location: "Remote (US)", remote: true }]) });
    const out = await ingestCompany(db, c, f);
    expect(out.status).toBe("ok");
    const co = await db.company.findUniqueOrThrow({ where: { id: c.id } });
    expect(co.atsProvider).toBe("ASHBY");
    const j = await db.job.findFirstOrThrow({ where: { companyId: c.id } });
    expect(j.salaryMax).toBe(175000);
    expect(j.equityMentioned).toBe(true);
    expect(j.isRemote).toBe(true);
  });
});
