import { describe, expect, it } from "vitest";
import { scoreJob, WEIGHTS, companyAttractiveness } from "@/lib/scoring";
import { classifyTitle } from "@/lib/roles";
import { parseCompensation, parseLocation, requiresClearance, parseYearsRequired } from "@/lib/normalize";

const strong = { marketPositionScore: 90, equityUpsideScore: 85, compCompetitiveness: 90, totalOpenings: 300 };
const desc = "Strategic enterprise sales into healthcare and public sector. Engage CFO and CIO executives. Experience selling ERP or cloud platforms. 8+ years of enterprise software sales experience. ".repeat(4);

describe("weights", () => {
  it("sum to 100 with the specified split", () => {
    expect(Object.values(WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
    expect(WEIGHTS).toEqual({ qualifications: 25, compensation: 20, company: 15, equity: 15, location: 10, leadership: 10, momentum: 5 });
  });
});

describe("title classification", () => {
  it.each([
    ["Strategic Account Executive, Healthcare", "STRATEGIC_AE"],
    ["Enterprise Account Executive - SLED", "ENTERPRISE_AE"],
    ["Director, Sales Development", "SDR_LEADER"],
    ["Head of Sales Development (AMER)", "SDR_LEADER"],
    ["Regional Sales Director, Southwest", "SALES_DIRECTOR"],
    ["Account Director, Public Sector", "ACCOUNT_DIRECTOR"],
    ["Director of Business Development", "BD_LEADER"],
    ["Sales Development Representative", "SDR_IC"],
    ["Senior Software Engineer", "NOT_RELEVANT"],
    ["Solutions Engineer, Enterprise", "NOT_RELEVANT"],
  ])("%s → %s", (t, f) => expect(classifyTitle(t).family).toBe(f));
});

describe("scoring", () => {
  it("a strategic remote role with strong published OTE at a strong company is Tier 1", () => {
    const r = scoreJob({ title: "Strategic Account Executive", descriptionText: desc, location: "Remote - US", isRemote: true, oteMax: 340000, postedAt: new Date(), yearsRequired: 8, company: strong });
    expect(r.score).toBeGreaterThanOrEqual(72);
    expect(r.tier).toBe("TIER1");
    expect(r.category).toBe("MAIN");
    expect(r.reasons.some((x) => x.criterion === "compensation" && x.delta === "+")).toBe(true);
  });
  it("every criterion stays within its weight and explanations exist for each", () => {
    const r = scoreJob({ title: "Enterprise Account Executive", descriptionText: desc, location: "Phoenix, AZ", company: strong });
    for (const [k, w] of Object.entries(WEIGHTS)) expect(r.breakdown[k as keyof typeof WEIGHTS]).toBeLessThanOrEqual(w);
    for (const k of Object.keys(WEIGHTS)) expect(r.reasons.some((x) => x.criterion === k)).toBe(true);
  });
  it("roles requiring clearance are excluded", () => {
    const r = scoreJob({ title: "Account Executive, Federal", descriptionText: "Must hold an active TS/SCI clearance. " + desc, requiresClearance: true, location: "Remote - US", isRemote: true, company: strong });
    expect(r.category).toBe("EXCLUDED");
    expect(r.excludedReason).toMatch(/clearance/);
  });
  it("on-site roles elsewhere go to the separate relocation category, never Tier 1", () => {
    const r = scoreJob({ title: "Strategic Account Executive", descriptionText: desc, location: "Chicago, IL", oteMax: 400000, company: strong });
    expect(r.category).toBe("RELOCATION");
    expect(r.tier).not.toBe("TIER1");
  });
  it("non-US roles are excluded", () => {
    expect(scoreJob({ title: "Enterprise Account Executive", location: "London, UK", company: strong }).category).toBe("EXCLUDED");
  });
  it("VP roles are flagged as stretch", () => {
    expect(scoreJob({ title: "VP of Sales, North America", descriptionText: desc, location: "Remote - US", isRemote: true, company: strong }).category).toBe("STRETCH");
  });
  it("unpublished pay lowers confidence rather than inventing a number", () => {
    const r = scoreJob({ title: "Enterprise Account Executive", location: "Remote", company: strong });
    expect(r.confidence).toBe("Low");
    expect(r.reasons.find((x) => x.criterion === "compensation")?.text).toMatch(/No published pay/);
  });
  it("company attractiveness is independent of openings", () => {
    expect(companyAttractiveness(strong)).toBeGreaterThan(80);
  });
});

describe("normalisation", () => {
  it("extracts OTE vs base ranges", () => {
    expect(parseCompensation("The OTE range for this role is $280,000 - $340,000 USD.")).toMatchObject({ oteMin: 280000, oteMax: 340000 });
    expect(parseCompensation("Base salary range: $150,000—$180,000")).toMatchObject({ salaryMin: 150000, salaryMax: 180000 });
    expect(parseCompensation("We pay $25 - $30 per hour")).toEqual({});
  });
  it("parses locations", () => {
    expect(parseLocation("Phoenix, AZ").azMetro).toBe(true);
    expect(parseLocation("Remote - US").isRemote).toBe(true);
    expect(parseLocation("Toronto, Canada").isUS).toBe(false);
    expect(parseLocation("Hybrid - Scottsdale, Arizona").arrangement).toBe("Hybrid");
  });
  it("detects clearance requirements and their absence", () => {
    expect(requiresClearance("Candidates must hold an active Secret clearance")).toBe(true);
    expect(requiresClearance("No security clearance required")).toBe(false);
  });
  it("reads years of experience", () => expect(parseYearsRequired("10+ years of enterprise sales experience")).toBe(10));
  describe("East Coast roles (West-based candidate)", () => {
    const sae = (location: string, extra: object = {}) => scoreJob({ title: "Strategic Account Executive", descriptionText: desc, location, company: strong, ...extra });
    it("excludes on-site or hybrid East Coast roles", () => {
      for (const loc of ["New York, NY", "Boston, MA; New York, NY", "Washington, DC", "Atlanta, GA (Hybrid)", "East Coast"]) {
        const r = sae(loc);
        expect(r.category, loc).toBe("EXCLUDED");
        expect(r.excludedReason, loc).toMatch(/East Coast/);
      }
    });
    it("keeps East Coast roles that are open to remote", () => {
      expect(sae("Remote - New York", { isRemote: true }).category).toBe("MAIN");
      expect(sae("New York, NY or Remote (US)", { isRemote: true }).category).toBe("MAIN");
    });
    it("excludes remote roles that require living on the East Coast", () => {
      expect(sae("Remote - East Coast", { isRemote: true }).category).toBe("EXCLUDED");
      expect(sae("Remote - US", { isRemote: true, descriptionText: desc + " Candidates must reside on the East Coast." }).category).toBe("EXCLUDED");
    });
    it("leaves West, Southwest and multi-region roles alone", () => {
      expect(sae("Phoenix, AZ").category).toBe("MAIN");
      expect(sae("Seattle, WA").category).toBe("RELOCATION");
      expect(sae("New York, NY; San Francisco, CA").category).toBe("RELOCATION");
    });
  });
});
