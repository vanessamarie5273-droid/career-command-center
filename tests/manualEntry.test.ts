import { describe, expect, it, vi, beforeAll, afterAll } from "vitest";
import { splitName } from "@/lib/manualEntry";
import { mockFetch } from "./fixtures/boards";

vi.mock("@/lib/db", async () => ({ prisma: (await import("./setup-db")).testDb() }));
vi.mock("@/lib/auth", async (orig) => ({ ...(await orig<typeof import("@/lib/auth")>()), requireUser: async () => ({ sub: "u1", role: "ADMIN" }) }));

describe("splitting a typed name", () => {
  it("keeps everything after the first word as the last name", () => {
    expect(splitName(" Jane  van Dyke ")).toEqual({ firstName: "Jane", lastName: "van Dyke" });
    expect(splitName("Priya")).toEqual({ firstName: "Priya", lastName: null });
  });
});

describe("adding a company or a role by hand", () => {
  let db: Awaited<typeof import("@/lib/db")>["prisma"];
  let POST: typeof import("@/app/api/jobs/route")["POST"];
  beforeAll(async () => {
    db = (await import("@/lib/db")).prisma;
    POST = (await import("@/app/api/jobs/route")).POST;
    vi.stubGlobal("fetch", mockFetch({})); // no public job board anywhere
  });
  afterAll(async () => { vi.unstubAllGlobals(); await db.$disconnect(); });
  const post = (body: unknown) => POST(new Request("http://x/api/jobs", { method: "POST", body: JSON.stringify(body) }), {});

  it("saves an unposted role heard about in a feed comment, with no link", async () => {
    const res = await post({
      newCompany: { name: "Quiet Hire Co", category: "Enterprise AI & Agents" }, title: "Enterprise Account Executive", location: "Phoenix, AZ", url: "",
      source: "FEED", foundUrl: "https://www.linkedin.com/posts/jane-doe_hiring-activity-123", notes: "VP said they're hiring an AE for the Southwest before posting it.",
      contact: { name: "Jane Doe", title: "VP Sales", linkedinUrl: "https://www.linkedin.com/in/janedoe-test" },
    });
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(j.addedCompany).toBe(true);
    const job = await db.job.findUniqueOrThrow({ where: { id: j.id }, include: { sources: true, referrer: true, events: true } });
    expect(job.applyUrl).toBe("");
    expect(job.manual).toBe(true);
    expect(job.alertedAt).not.toBeNull(); // she added it herself: no alert email about it
    expect(job.notes).toContain("Southwest");
    expect(job.foundUrl).toBe("https://www.linkedin.com/posts/jane-doe_hiring-activity-123");
    expect(job.sources[0].provider).toBe("FEED");
    expect(job.sources[0].externalId).toMatch(/^manual:/);
    expect(job.referrer?.firstName).toBe("Jane");
    expect(job.referrer?.companyId).toBe(job.companyId);
    expect(job.events[0].detail).toBe("Added by you: LinkedIn post or comment from Jane Doe (not posted)");
    expect(job.score).not.toBeNull();
  });

  it("joins the posting onto the unposted role when she adds it again with the link", async () => {
    const co = await db.company.findFirstOrThrow({ where: { name: "Quiet Hire Co" } });
    const res = await post({ companyId: co.id, title: "Enterprise Account Executive", location: "Phoenix, AZ", url: "https://quiethire.example.com/careers/jobs/12345", source: "MANUAL", notes: "Now posted." });
    const j = await res.json();
    expect(j.duplicate).toBe(true);
    const job = await db.job.findUniqueOrThrow({ where: { id: j.id }, include: { sources: true } });
    expect(job.applyUrl).toBe("https://quiethire.example.com/careers/jobs/12345");
    expect(job.notes).toBe("VP said they're hiring an AE for the Southwest before posting it.\nNow posted.");
    expect(job.sources).toHaveLength(2);
    expect(await db.contact.count({ where: { linkedinUrl: "https://www.linkedin.com/in/janedoe-test" } })).toBe(1);
  });

  it("adds just a company, with a note and the person who mentioned it", async () => {
    const res = await post({ companyOnly: true, newCompany: { name: "Stealth Startup AI", category: "Enterprise AI & Agents" }, source: "NETWORK", notes: "Raising a Series B, building a sales team in Phoenix.", contact: { name: "Sam Lee" } });
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(j.addedCompany).toBe(true);
    const c = await db.company.findUniqueOrThrow({ where: { id: j.companyId }, include: { activities: true, contacts: true, jobs: true } });
    expect(c.website).toBeNull();
    expect(c.jobs).toHaveLength(0);
    expect(c.activities[0].body).toContain("Someone told me, from Sam Lee");
    expect(c.activities[0].body).toContain("Series B");
    expect(c.contacts.map((p) => p.firstName)).toEqual(["Sam"]);
  });

  it("asks for a title when adding a role", async () => {
    const co = await db.company.findFirstOrThrow({ where: { name: "Quiet Hire Co" } });
    const res = await post({ companyId: co.id, title: "", source: "FEED" });
    expect(res.status).toBe(400);
    expect((await res.json()).issues[0].message).toBe('Give the role a title, or choose "Just the company"');
  });

  it("saves a Workday posting link from the current /details/ site", async () => {
    const co = await db.company.findFirstOrThrow({ where: { name: "Quiet Hire Co" } });
    const url = "https://workday.wd5.myworkdayjobs.com/en-US/Workday/details/Manager--Business-Development_JR-0111232?q=business+development";
    const res = await post({ companyId: co.id, title: "Business Development Manager", remote: true, url, source: "MANUAL" });
    expect(res.status).toBe(200);
    const job = await db.job.findUniqueOrThrow({ where: { id: (await res.json()).id } });
    expect(job.applyUrl).toBe(url);
  });

  it("still turns away a careers homepage given as the posting link", async () => {
    const co = await db.company.findFirstOrThrow({ where: { name: "Quiet Hire Co" } });
    const res = await post({ companyId: co.id, title: "Account Executive", url: "https://quiethire.example.com/careers" });
    expect(res.status).toBe(400);
  });
});
