import { describe, expect, it } from "vitest";
import { fetchWorkable } from "@/lib/ingest/workable";
import { fetchAmazon } from "@/lib/ingest/amazon";
import { fetchOracle } from "@/lib/ingest/oracle";
import { candidates, discoverBoard } from "@/lib/ingest/providers";
import { growthOutlook } from "@/lib/growth";
import { scoreJob } from "@/lib/scoring";
import { mockFetch } from "./fixtures/boards";

const DESC = "<p>Own strategic enterprise accounts selling cloud and AI to CFO and CIO buyers.</p>";

describe("more first-party job sources", () => {
  it("reads a Workable board", async () => {
    const r = await fetchWorkable("acme", mockFetch({ "apply.workable.com/api/v1/widget/accounts/acme": { jobs: [
      { title: "Enterprise Account Executive", shortcode: "AB12", url: "https://apply.workable.com/acme/j/AB12/", telecommuting: true, published_on: "2026-10-20", country: "United States", description: DESC },
    ] } }));
    expect(r.postings).toHaveLength(1);
    expect(r.postings[0]).toMatchObject({ provider: "WORKABLE", externalId: "acme:AB12", isRemote: true, applyUrl: "https://apply.workable.com/acme/j/AB12/" });
  });

  it("reads amazon.jobs and keeps only the named business", async () => {
    const r = await fetchAmazon("amazon|Amazon Web Services", mockFetch({ "amazon.jobs/en/search.json": { hits: 2, jobs: [
      { id_icims: "1", title: "Enterprise Account Manager, AWS", job_path: "/en/jobs/1/enterprise-account-manager", posted_date: "October 20, 2026", normalized_location: "Seattle, Washington, USA", company_name: "Amazon Web Services, Inc.", description: DESC },
      { id_icims: "2", title: "Account Executive, Advertising", job_path: "/en/jobs/2/account-executive", posted_date: "October 20, 2026", normalized_location: "New York, New York, USA", company_name: "Amazon.com Services LLC", description: DESC },
    ] } }));
    expect(r.postings.map((p) => p.externalId)).toEqual(["amazon:1"]);
    expect(r.postings[0]).toMatchObject({ provider: "AMAZON", applyUrl: "https://www.amazon.jobs/en/jobs/1/enterprise-account-manager" });
    expect(r.postings[0].postedAt?.getFullYear()).toBe(2026);
  });

  it("reads an Oracle Recruiting career site", async () => {
    const r = await fetchOracle("eeho.fa.us2.oraclecloud.com|CX_45001", mockFetch({
      recruitingCEJobRequisitionDetails: { items: [{ ExternalDescriptionStr: DESC }] },
      recruitingCEJobRequisitions: { items: [{ TotalJobsCount: 1, requisitionList: [{ Id: "300", Title: "Director, Business Development", PostedDate: "2026-10-21", PrimaryLocation: "United States", WorkplaceType: "Remote" }] }] },
    }));
    expect(r.postings).toHaveLength(1);
    expect(r.postings[0]).toMatchObject({ provider: "ORACLE", isRemote: true, descriptionHtml: DESC, applyUrl: "https://eeho.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_45001/job/300" });
  });

  it("looks for SmartRecruiters and Workable boards when discovering a company's feed", async () => {
    const providers = new Set(candidates("acme", "Acme", []).map((c) => c.provider));
    expect([...providers]).toEqual(["GREENHOUSE", "ASHBY", "LEVER", "SMARTRECRUITERS", "WORKABLE"]);
    const d = await discoverBoard("acme", "Acme", [], mockFetch({ "apply.workable.com/api/v1/widget/accounts/acme": { jobs: [{ title: "Account Executive", shortcode: "X1" }] } }));
    expect(d).toMatchObject({ provider: "WORKABLE", token: "acme" });
  });
});

describe("growth potential", () => {
  it("combines the assessment with hiring, funding and revenue signals", () => {
    const now = new Date("2026-10-29");
    const g = growthOutlook({ growthScore: 90, growthThesis: "AIP drove a step change", totalOpenings: 400, revenueGrowth: "48% year over year", news: [{ kind: "funding", headline: "Raised $1B Series F", publishedAt: new Date("2026-08-01") }] }, now);
    expect(g.score).toBe(100);
    expect(g.label).toBe("Hypergrowth");
    expect(g.signals.map((s) => s.delta)).toEqual(["+", "+", "+", "+"]);
    expect(growthOutlook({}).assessed).toBe(false);
  });

  it("counts growth in the match score, including equity at fast-growing public companies", () => {
    const job = { title: "Strategic Account Executive", location: "Remote - US", isRemote: true, descriptionText: "" };
    const company = { marketPositionScore: 90, equityUpsideScore: 50, compCompetitiveness: 80, ownership: "Public" };
    const slow = scoreJob({ ...job, company: { ...company, growthScore: 40 } });
    const fast = scoreJob({ ...job, company: { ...company, growthScore: 96 } });
    expect(fast.score).toBeGreaterThan(slow.score);
    expect(fast.reasons.some((r) => r.criterion === "equity" && r.text.includes("growth potential"))).toBe(true);
  });
});
