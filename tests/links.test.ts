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
    // Workday's current site puts postings under /details/, often with a search query left on the link
    "https://workday.wd5.myworkdayjobs.com/en-US/Workday/details/Manager--Business-Development_JR-0111232?q=business+development",
    "https://salesforce.wd12.myworkdayjobs.com/en-US/External_Career_Site/job/Arizona---Phoenix/Account-Executive_JR290000-1",
    "https://acme.wd1.myworkdaysite.com/recruiting/acme/External/details/AE_R-12345",
    "https://careers.icims.com/jobs/12345/account-executive/job",
    "https://oracle.taleo.net/careersection/2/jobdetail.ftl?job=240001",
    "https://career4.successfactors.com/sfcareer/jobreqcareer?jobId=12345&company=acme",
    "https://www.linkedin.com/jobs/view/4012345678/",
    "https://www.linkedin.com/jobs/collections/recommended/?currentJobId=4012345678",
    "https://www.indeed.com/viewjob?jk=a1b2c3d4e5f6",
    "https://apply.workable.com/acme/j/ABCD1234EF/",
    "https://jobs.jobvite.com/acme/job/oAbCdEf",
    "https://careers.cisco.com/global/en/job/1420000/Account-Manager",
    "https://www.amazon.jobs/en/jobs/2800000/account-manager",
    "https://ats.rippling.com/acme/jobs/0b9a7a2e-1111-2222-3333-444455556666",
    "https://acme.bamboohr.com/careers/123",
    "https://job-boards.greenhouse.io/embed/job_app?for=acme&token=7012345",
  ])("accepts specific posting %s", (u) => expect(isSpecificJobUrl(u)).toBe(true));
  it.each([
    "https://www.example.com/careers",
    "https://www.example.com/careers/",
    "https://www.example.com/jobs",
    "https://boards.greenhouse.io/databricks",
    "https://jobs.lever.co/veeva",
    "https://jobs.ashbyhq.com/openai",
    "https://www.example.com/",
    "https://www.example.com/en-us/careers/search",
    "https://www.example.com/jobs/search-results?keywords=sales",
    "https://careers.cisco.com/global/en/search-results",
    "https://workday.wd5.myworkdayjobs.com/en-US/Workday",
    "https://workday.wd5.myworkdayjobs.com/en-US/Workday?q=sales",
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
