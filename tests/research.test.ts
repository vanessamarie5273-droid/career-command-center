import { describe, expect, it, vi, beforeAll, afterAll } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { planResearch, ResearchResult, seenUrls, type ResearchResult as R } from "@/lib/research";
import { makeCompany } from "./setup-db";
import { mockFetch } from "./fixtures/boards";

vi.mock("@/lib/db", async () => ({ prisma: (await import("./setup-db")).testDb() }));
vi.mock("@/lib/auth", async (orig) => ({ ...(await orig<typeof import("@/lib/auth")>()), requireUser: async () => ({ sub: "u1", role: "ADMIN" }) }));

const SRC = "https://acme.example/press/q3-results";
const NEWS = "https://news.example/acme-raises-200m";
const TEAM = "https://acme.example/about/leadership";

const result = (over: Partial<R> = {}): R => ResearchResult.parse({
  website: "https://acme.example", linkedinUrl: "https://www.linkedin.com/company/acme-example", jobBoardUrl: "https://job-boards.greenhouse.io/acmeexample/jobs/123",
  headquarters: "Phoenix, AZ", ownership: "Private", ticker: null, maturity: "High-growth private",
  description: "Acme sells AI scheduling to hospital systems. It wins on time to value.", keyProducts: "Acme Flow, Acme Staff", customers: "Banner Health",
  buyerPersonas: "CNOs, CFOs", footprint: "U.S.; Phoenix HQ",
  growthScore: 140, growthThesis: "Hospital AI spend is rising fast", marketPositionScore: 72, equityUpsideScore: 80, compCompetitiveness: 70,
  assessmentRationale: "Strong momentum.", risks: "Concentrated in one vertical.", cultureNotes: "Hybrid, Phoenix office.",
  financials: { revenue: "$90M ARR (2026)", revenueGrowth: "60% year over year", fundingSummary: "Series C, $200M", valuation: null, investors: "Sequoia", liquidityNotes: null, sourceUrl: SRC },
  leaders: [{ name: "Dana Ruiz", title: "Chief Revenue Officer", linkedinUrl: "https://www.linkedin.com/in/danaruiz", sourceUrl: TEAM }, { name: "Made Up", title: "VP Sales", linkedinUrl: null, sourceUrl: "https://nowhere.example/x" }],
  news: [{ headline: "Acme raises $200M Series C", kind: "funding", url: NEWS, publishedAt: "2026-09-15" }, { headline: "Old news", kind: "product", url: SRC, publishedAt: "2023-01-01" }],
  sources: [{ title: "Q3 results", url: SRC }, { title: "Invented", url: "https://nowhere.example/y" }],
  ...over,
});

const seen = new Set([SRC, NEWS, TEAM].map((u) => u.toLowerCase().replace("https://www.", "https://")));
const base = { id: "c1", name: "Acme", website: null, logoUrl: null, linkedinUrl: "https://www.linkedin.com/search/results/companies/?keywords=Acme", careersUrl: null, leaders: [], news: [] } as unknown as Parameters<typeof planResearch>[0];

describe("deciding what research changes", () => {
  const now = new Date("2026-11-04T12:00:00Z");

  it("fills the profile, clamps scores, and keeps only sourced figures, leaders and news", () => {
    const p = planResearch(base, result(), seen, new Set(), now);
    const d = p.data as Record<string, unknown>;
    expect(d.description).toContain("AI scheduling");
    expect(d.growthScore).toBe(100);
    expect(d.revenue).toBe("$90M ARR (2026)");
    expect(d.financialSourceUrl).toBe(SRC);
    expect(d.linkedinUrl).toBe("https://www.linkedin.com/company/acme-example"); // replaces the LinkedIn search link
    expect(d.website).toBe("https://acme.example");
    expect(d.profileFactType).toBe("AI_ASSESSMENT");
    expect(d.profileVerifiedAt).toBeNull();
    expect(p.hint).toBe("greenhouse:acmeexample");
    expect(p.leaders.map((l) => l.name)).toEqual(["Dana Ruiz"]); // "Made Up" had no source the search returned
    expect(p.news.map((n) => n.headline)).toEqual(["Acme raises $200M Series C"]); // the 2023 item is too old
    expect(p.sources.map((x) => x.url)).toEqual([SRC]);
  });

  it("never overwrites a field she edited, and says so", () => {
    const mine = { ...base, description: "My own take on Acme.", growthScore: 55 } as typeof base;
    const p = planResearch(mine, result(), seen, new Set(["description", "growthScore"]), now);
    const d = p.data as Record<string, unknown>;
    expect(d.description).toBeUndefined();
    expect(d.growthScore).toBeUndefined();
    expect(p.kept).toEqual(expect.arrayContaining(["description", "growthScore"]));
  });

  it("drops every figure when the financial source wasn't in the search results", () => {
    const p = planResearch(base, result({ financials: { revenue: "$1B", revenueGrowth: null, fundingSummary: null, valuation: "$10B", investors: null, liquidityNotes: null, sourceUrl: "https://nowhere.example/z" } }), seen, new Set(), now);
    const d = p.data as Record<string, unknown>;
    expect(d.revenue).toBeUndefined();
    expect(d.valuation).toBeUndefined();
    expect(d.financialSourceUrl).toBeUndefined();
  });

  it("doesn't add a leader or a development that is already on the account", () => {
    const has = { ...base, leaders: [{ name: "dana ruiz" }], news: [{ headline: "Something else", url: NEWS }] } as typeof base;
    const p = planResearch(has, result(), seen, new Set(), now);
    expect(p.leaders).toHaveLength(0);
    expect(p.news).toHaveLength(0);
  });

  it("collects source URLs from search results but not from the model's own answer", () => {
    const urls = seenUrls([
      { type: "web_search_tool_result", content: [{ type: "web_search_result", url: "https://www.Acme.example/Press/", title: "x", encrypted_content: "zzz" }] },
      { type: "tool_use", name: "save_research", input: { sources: [{ url: "https://invented.example" }] } },
    ]);
    expect([...urls]).toEqual(["https://acme.example/press"]);
  });
});

describe("researching a company end to end", () => {
  let db: Awaited<typeof import("@/lib/db")>["prisma"];
  let research: typeof import("@/lib/research");
  beforeAll(async () => {
    db = (await import("@/lib/db")).prisma;
    research = await import("@/lib/research");
  });
  afterAll(async () => { await db.$disconnect(); });

  const searchBlock = { type: "web_search_tool_result", tool_use_id: "s1", content: [SRC, NEWS, TEAM].map((url) => ({ type: "web_search_result", url, title: "t", encrypted_content: "e", page_age: null })) };
  const fakeClient = (log: string[]) => {
    let call = 0;
    return async (p: Anthropic.Beta.MessageCreateParamsNonStreaming) => {
      call++;
      log.push(`call ${call}: ${p.messages.length} messages`);
      // First turn: the server-side search loop pauses; second: the model saves its research.
      const content = call === 1
        ? [{ type: "server_tool_use", id: "s1", name: "web_search", input: { query: "Acme" } }, searchBlock]
        : [{ type: "tool_use", id: "t1", name: "save_research", input: result() }];
      return { id: `m${call}`, type: "message", role: "assistant", model: "x", content, stop_reason: call === 1 ? "pause_turn" : "tool_use", usage: {} } as unknown as Anthropic.Beta.BetaMessage;
    };
  };

  it("fills the account, keeps her edits, refreshes openings and records what changed", async () => {
    const c = await makeCompany(db, { name: "Acme Research", atsProvider: "NONE", atsToken: null, growthScore: 50, description: "Typed by her" });
    await db.auditLog.create({ data: { userId: "u1", entity: "Company", entityId: c.id, action: "update", changes: { description: { from: null, to: "Typed by her" } } } });
    await db.job.create({ data: { companyId: c.id, fingerprint: `fp-${c.id}`, title: "Enterprise Account Executive", applyUrl: "https://x.example/1", score: 1 } });
    const log: string[] = [];
    const fetchBoards = mockFetch({ "boards-api.greenhouse.io/v1/boards/acmeexample/jobs": { jobs: [] } }) as unknown as typeof fetch;
    const { summary } = await research.researchCompany(db, c.id, { create: fakeClient(log), fetch: fetchBoards });

    expect(log).toEqual(["call 1: 1 messages", "call 2: 2 messages"]); // the paused turn was sent back to resume
    const after = await db.company.findUniqueOrThrow({ where: { id: c.id }, include: { leaders: true, news: true, activities: true } });
    expect(after.description).toBe("Typed by her");
    expect(after.keyProducts).toBe("Acme Flow, Acme Staff");
    expect(after.growthScore).toBe(100);
    expect(after.revenue).toBe("$90M ARR (2026)");
    expect(after.leaders.map((l) => [l.name, l.sourceUrl])).toEqual([["Dana Ruiz", TEAM]]);
    expect(after.news.map((n) => n.headline)).toEqual(["Acme raises $200M Series C"]);
    expect(after.atsHints).toContain("greenhouse:acmeexample");
    expect(after.atsProvider).toBe("GREENHOUSE"); // the board the research found is now the feed
    expect(after.researchStatus).toBe("done");
    expect(after.researchedFields).toContain("keyProducts");
    expect(after.researchedFields).not.toContain("description");
    expect(summary).toContain("Kept your edits to business & positioning");
    expect(after.activities.some((a) => a.kind === "research")).toBe(true);
    const job = await db.job.findFirstOrThrow({ where: { companyId: c.id } });
    expect(job.score).not.toBe(1); // rescored with the new growth score
  });

  it("marks the research failed with a plain reason when the model declines", async () => {
    const c = await makeCompany(db, { name: "Declined Co" });
    const create = async () => ({ content: [], stop_reason: "refusal" }) as unknown as Anthropic.Beta.BetaMessage;
    await expect(research.researchCompany(db, c.id, { create })).rejects.toThrow(/declined/);
    const after = await db.company.findUniqueOrThrow({ where: { id: c.id } });
    expect(after.researchStatus).toBe("error");
    expect(after.researchError).toMatch(/declined/);
  });

  it("runs one research at a time", async () => {
    const a = await makeCompany(db, { name: "Queue A" });
    const b = await makeCompany(db, { name: "Queue B" });
    let inFlight = 0, most = 0;
    const create = async () => {
      inFlight++; most = Math.max(most, inFlight);
      await new Promise((r) => setTimeout(r, 30));
      inFlight--;
      return { content: [{ type: "tool_use", id: "t", name: "save_research", input: result({ leaders: [], news: [], financials: { revenue: null, revenueGrowth: null, fundingSummary: null, valuation: null, investors: null, liquidityNotes: null, sourceUrl: null } }) }], stop_reason: "tool_use" } as unknown as Anthropic.Beta.BetaMessage;
    };
    const fetchBoards = mockFetch({}) as unknown as typeof fetch;
    const first = await research.startResearch(db, a.id, { create, fetch: fetchBoards });
    const second = await research.startResearch(db, b.id, { create, fetch: fetchBoards });
    expect((await db.company.findUniqueOrThrow({ where: { id: b.id } })).researchStatus).toBe("queued");
    expect((await research.startResearch(db, a.id, { create })).started).toBe(false); // already under way
    await Promise.all([first.done, second.done]);
    expect(most).toBe(1);
    expect((await db.company.findUniqueOrThrow({ where: { id: b.id } })).researchStatus).toBe("done");
  });

  it("asks for the API key instead of starting when none is set", async () => {
    const c = await makeCompany(db, { name: "No Key Co" });
    const { POST } = await import("@/app/api/companies/[id]/research/route");
    const prev = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    const res = await POST(new Request("http://x", { method: "POST" }), { params: Promise.resolve({ id: c.id }) });
    if (prev) process.env.ANTHROPIC_API_KEY = prev;
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/ANTHROPIC_API_KEY/);
  });

  it("treats a research left running by a restart as stopped", () => {
    const old = new Date(Date.now() - 20 * 60_000);
    expect(research.researchActive({ researchStatus: "running", researchStartedAt: old })).toBe(false);
    expect(research.researchActive({ researchStatus: "running", researchStartedAt: new Date() })).toBe(true);
  });
});
