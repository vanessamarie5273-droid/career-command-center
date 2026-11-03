import { describe, expect, it, vi, beforeAll, afterAll } from "vitest";
import { boardHintFromUrl, websiteFromUrl } from "@/lib/companies";
import { greenhouseBoard, mockFetch } from "./fixtures/boards";

vi.mock("@/lib/db", async () => ({ prisma: (await import("./setup-db")).testDb() }));
vi.mock("@/lib/auth", async (orig) => ({ ...(await orig<typeof import("@/lib/auth")>()), requireUser: async () => ({ sub: "u1", role: "ADMIN" }) }));

describe("reading the employer from a posting link", () => {
  it.each([
    ["https://job-boards.greenhouse.io/acmeai/jobs/7012345002", "greenhouse:acmeai"],
    ["https://boards.greenhouse.io/acmeai/jobs/45678", "greenhouse:acmeai"],
    ["https://boards.greenhouse.io/embed/job_app?for=acmeai&token=123", "greenhouse:acmeai"],
    ["https://jobs.lever.co/veeva/0b9a7a2e-1111-2222-3333-444455556666", "lever:veeva"],
    ["https://jobs.ashbyhq.com/openai/0b9a7a2e-1111-2222-3333-444455556666", "ashby:openai"],
    ["https://jobs.smartrecruiters.com/Visa/743999912345678", "smartrecruiters:Visa"],
    ["https://intel.wd1.myworkdayjobs.com/en-US/External/job/US-Arizona-Phoenix/AE_JR123", "workday:intel|wd1|External"],
    ["https://workday.wd5.myworkdayjobs.com/Workday/job/USA-AZ-Remote/Strategic-AE_JR-12345", "workday:workday|wd5|Workday"],
  ])("%s → %s", (url, hint) => expect(boardHintFromUrl(url)).toBe(hint));

  it("gives no board for LinkedIn or a company's own site", () => {
    expect(boardHintFromUrl("https://www.linkedin.com/jobs/view/4012345678")).toBeUndefined();
    expect(boardHintFromUrl("https://careers.acme.com/jobs/12345")).toBeUndefined();
  });

  it("uses the employer's site only when the posting lives on it", () => {
    expect(websiteFromUrl("https://careers.acme.com/jobs/12345")).toBe("https://acme.com");
    expect(websiteFromUrl("https://www.acme.com/careers/job/ae-123")).toBe("https://acme.com");
    expect(websiteFromUrl("https://www.linkedin.com/jobs/view/4012345678")).toBeUndefined();
    expect(websiteFromUrl("https://job-boards.greenhouse.io/acme/jobs/1")).toBeUndefined();
  });
});

describe("adding a job for a company that isn't an account yet", () => {
  let db: Awaited<typeof import("@/lib/db")>["prisma"];
  let POST: typeof import("@/app/api/jobs/route")["POST"];
  beforeAll(async () => {
    db = (await import("@/lib/db")).prisma;
    POST = (await import("@/app/api/jobs/route")).POST;
    vi.stubGlobal("fetch", mockFetch({ "boards-api.greenhouse.io/v1/boards/newcoai": greenhouseBoard([{ id: 9001, title: "Enterprise Account Executive", location: "Remote - US" }]) }));
  });
  afterAll(async () => { vi.unstubAllGlobals(); await db.$disconnect(); });
  const post = (body: unknown) => POST(new Request("http://x/api/jobs", { method: "POST", body: JSON.stringify(body) }), {});

  it("creates the account, wires its job board from the link, and saves the job", async () => {
    const res = await post({ newCompany: { name: "NewCo AI", category: "Enterprise AI & Agents" }, title: "Strategic Account Executive", url: "https://job-boards.greenhouse.io/newcoai/jobs/1234567", source: "LINKEDIN" });
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(j.addedCompany).toBe(true);
    const job = await db.job.findUniqueOrThrow({ where: { id: j.id }, include: { company: true } });
    expect(job.company.name).toBe("NewCo AI");
    expect(job.company.atsHints).toEqual(["greenhouse:newcoai"]);
    expect(job.company.atsProvider).toBe("GREENHOUSE");
    expect(job.company.addedBy).toBe("user");
    // The board's other openings came in with it.
    expect(await db.job.count({ where: { companyId: job.companyId } })).toBe(2);
  });

  it("reuses the account when the typed name already exists", async () => {
    const res = await post({ newCompany: { name: "newco ai", category: "Enterprise AI & Agents" }, title: "Enterprise Account Executive, West", url: "https://www.linkedin.com/jobs/view/4012345678" });
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(j.addedCompany).toBe(false);
    expect(await db.company.count({ where: { name: { equals: "NewCo AI", mode: "insensitive" } } })).toBe(1);
  });

  it("asks for a company when neither is given", async () => {
    const res = await post({ title: "Account Executive", url: "https://job-boards.greenhouse.io/x/jobs/1" });
    expect(res.status).toBe(400);
    expect((await res.json()).issues[0].message).toBe("Choose a company or add a new one");
  });
});
