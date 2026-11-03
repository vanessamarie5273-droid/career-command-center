import { describe, expect, it, vi, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";

const create = vi.fn(async (req: { messages: { content: string }[] }) => ({ stop_reason: "end_turn", content: [{ type: "text", text: `OUT ${req.messages[0].content.slice(0, 20)}` }] }));
vi.mock("@anthropic-ai/sdk", () => ({ default: class { beta = { messages: { create } }; } }));

import { checkKit, copiedFrom, generateKit, kitContext, unsupportedFigures, KIT_PARTS, type KitInput } from "@/lib/kit";
import { exportAll, restoreAll } from "@/lib/backup";
import { herLetter, isPublicSectorRole } from "@/lib/letterStyle";
import { testDb, makeCompany } from "./setup-db";

const RESUME = "VANESSA MORALES\nvanessa@example.com\nEXPERIENCE\nSAP, Nov 2024 – Present\n- Closed $8.5M in new and expansion revenue; earned Winners Circle 2025.\n- Expanded the account with a $1.58M TCV licensing upsell.\n- Led the team to $15.6M in closed revenue and $80.6M in pipeline; 25% increase in pipeline creation, 30% increase in conversion.";
const input: KitInput = {
  resumeText: RESUME,
  job: { title: "Strategic Account Executive", location: "Remote, US", descriptionText: `Own a $2M quota across Fortune 500 accounts. 8+ years required. ${"Build executive relationships and run complex multi-stakeholder cycles. ".repeat(20)}`, requiredQuals: null, preferredQuals: null },
  company: { name: "Acme AI", category: "Enterprise AI & Agents", maturity: "High-growth private", description: "Agents for finance teams.", keyProducts: null, customers: null, buyerPersonas: "CFO", risks: null, news: ["Raised Series C"] },
};
const ctx = kitContext(input);
const src = { resumeText: RESUME, contextText: ctx, input };
const clean = Object.fromEntries(KIT_PARTS.map((p) => [p, "Your posting points to stalled pipeline. I closed $8.5M and earned Winners Circle 2025."])) as Record<(typeof KIT_PARTS)[number], string>;
const LETTER = `Dear Acme AI Hiring Team,

Finance teams do not buy agents to save clicks. They buy them when the CFO can see the close shrink, and most vendors pitch the controller instead.

I have sold to that CFO for years. I build the business case from the customer's own financials, and that approach closed $8.5M and earned Winners Circle 2025.

At Acme AI, I would open every account with the cost of last quarter's close.

I would welcome a conversation about where your largest accounts stand today.

Kindest regards,
Vanessa Morales`;
clean.letter = LETTER;

describe("Application Kit checks", () => {
  it("passes text that uses only her figures and plain language", () => {
    const checks = checkKit(clean, src);
    for (const p of KIT_PARTS) expect(checks[p]).toEqual([]);
  });

  it("flags language her brief rules out", () => {
    const checks = checkKit({ ...clean, letter: "I am interested in this role. I am passionate about sales and grateful for the opportunity to join. I was responsible for pipeline." }, src);
    const found = checks.letter.filter((i) => i.kind === "language").map((i) => i.text.toLowerCase());
    expect(found).toEqual(expect.arrayContaining(["passionate", "grateful", "opportunity to join", "responsible for"]));
    expect(found).not.toContain("i am interested in"); // her own opener
  });

  it("flags figures that are not in her resume or profile", () => {
    const checks = checkKit({ ...clean, resume: "Closed $40M in new logos at 150% of plan. $8.5M closed." }, src);
    expect(checks.resume.filter((i) => i.kind === "figure").map((i) => i.text)).toEqual(["$40M", "150%"]);
  });

  it("lets the point of view quote the posting, but not the resume or letter", () => {
    const quoting = "You carry a $2M quota per seller.";
    const checks = checkKit({ ...clean, pov: quoting, letter: `${clean.letter} ${quoting}` }, src);
    expect(checks.pov).toEqual([]);
    expect(checks.letter.map((i) => i.text)).toEqual(["$2M"]);
  });

  it("flags a placeholder left behind", () => {
    expect(checkKit({ ...clean, letter: LETTER.replace("At Acme AI", "At [Company]") }, src).letter.map((i) => i.text)).toContain("[Company]");
  });

  it("flags a letter that skips the company or drops paragraphs", () => {
    const checks = checkKit({ ...clean, letter: "Dear Hiring Team,\n\nI want this role.\n\nLet's talk.\n\nKindest Regards,\nVanessa Morales" }, src);
    expect(checks.letter.filter((i) => i.kind === "structure").map((i) => i.text)).toEqual(["2 paragraphs", "Company not named"]);
  });

  it("flags a letter that opens with interest instead of a point of view", () => {
    const checks = checkKit({ ...clean, letter: LETTER.replace("Finance teams do not", "I am interested in this role. Finance teams do not") }, src);
    expect(checks.letter.map((i) => i.text)).toEqual(["Opens with interest"]);
  });

  it("flags a letter that repeats the job posting back", () => {
    const checks = checkKit({ ...clean, letter: LETTER.replace("I have sold to that CFO", "You need someone to build executive relationships and run complex multi-stakeholder cycles. I have sold to that CFO") }, src);
    expect(checks.letter.map((i) => i.text)).toContain("Repeats the posting");
  });

  it("flags a letter that lists results instead of one or two proof points", () => {
    const checks = checkKit({ ...clean, letter: LETTER.replace("closed $8.5M", "closed $8.5M, grew one account by $1.58M, led a team to $15.6M") }, src);
    expect(checks.letter.map((i) => i.text)).toContain("3 figures");
  });

  it("passes both of her own letters", () => {
    for (const job of [{ ...input.job, title: "Account Executive, SLED" }, input.job]) {
      const i = { ...input, job };
      expect(checkKit({ letter: herLetter(job, input.company) }, { resumeText: RESUME, contextText: kitContext(i), input: i }).letter).toEqual([]);
    }
  });

  it("flags a letter that restates her resume", () => {
    const rehash = LETTER.replace("that approach closed $8.5M", "Closed $8.5M in new and expansion revenue; earned Winners Circle 2025. Expanded the account with a $1.58M TCV licensing upsell. I");
    expect(checkKit({ ...clean, letter: rehash }, src).letter.map((i) => i.text)).toContain("Copies your resume");
    expect(copiedFrom(LETTER, RESUME, 10)).toBeNull();
  });

  it("flags a kit written without the job description", () => {
    const thin = { ...input, job: { ...input.job, descriptionText: "Strategic AE." } };
    const checks = checkKit(clean, { resumeText: RESUME, contextText: kitContext(thin), input: thin });
    expect(checks.letter.map((i) => i.kind)).toEqual(["source"]);
    expect(kitContext(thin)).toMatch(/only 2 words of the job description/);
  });

  it("ignores list numbers and the 30-60-90 plan", () => {
    expect(unsupportedFigures("1. First 30 days\n2. Days 31-60\n3. Days 61-90", RESUME)).toEqual([]);
  });

  it("flags long sentences and an over-long letter", () => {
    const long = `${"word ".repeat(45)}end.`;
    const checks = checkKit({ ...clean, letter: `${clean.letter} ${long} ${"more ".repeat(260)}` }, src);
    expect(checks.letter.filter((i) => i.kind === "length")).toHaveLength(2);
  });
});

describe("Application Kit generation", () => {
  it("writes the other four parts from one cached context that holds her resume and the posting", async () => {
    create.mockClear();
    const parts = await generateKit(input);
    expect(Object.keys(parts).sort()).toEqual([...KIT_PARTS].sort());
    expect(create).toHaveBeenCalledTimes(4);
    const systems = create.mock.calls.map((c) => JSON.stringify((c[0] as unknown as { system: unknown }).system));
    expect(new Set(systems).size).toBe(1);
    expect(systems[0]).toContain("Closed $8.5M in new and expansion revenue");
    expect(systems[0]).not.toContain("PROFILE FACTS");
    expect(systems[0]).toContain("Own a $2M quota");
    expect(systems[0]).toContain("ephemeral");
  });

  it("puts the posting and the company research ahead of her resume", () => {
    const rich = kitContext({ ...input, job: { ...input.job, territory: "Texas" }, company: { ...input.company, growthThesis: "Agents replace close checklists.", engagementStrategy: "Enter through the controller.", notes: "Met their CRO at Dreamforce." } });
    expect(rich).toContain("Territory: Texas");
    expect(rich).toContain("Growth thesis:\nAgents replace close checklists.");
    expect(rich).toContain("Enter through the controller.");
    expect(rich).toContain("Met their CRO at Dreamforce.");
    expect(rich.indexOf("JOB POSTING")).toBeLessThan(rich.indexOf("RESUME"));
  });

  it("uses her own letters: public sector for government roles, commercial for the rest", async () => {
    create.mockClear();
    const gov = { ...input, job: { ...input.job, title: "Enterprise Core Account Executive - Public Sector" }, company: { ...input.company, name: "Samsara" } };
    const parts = await generateKit(gov);
    expect(create).toHaveBeenCalledTimes(4);
    expect(parts.letter).toMatch(/^Dear Samsara Hiring Team,/);
    expect(parts.letter).toContain("I’d like to bring that experience to Samsara as Enterprise Core Account Executive, Public Sector.");
    expect(parts.letter).toContain("support Samsara’s growth.");
    expect(parts.letter).not.toMatch(/\[(Company|Position)\]/);

    const commercial = (await generateKit(input)).letter;
    expect(commercial).toContain("I’d like to bring that discipline to Acme AI as Strategic Account Executive.");
    expect(commercial).toContain("help Acme AI build pipeline");
    expect(commercial).toMatch(/Kindest regards,\nVanessa Morales$/);
  });

  it("tells public sector roles apart", () => {
    expect(isPublicSectorRole({ title: "Account Executive, SLED" }, { category: "Cloud & Enterprise Automation" })).toBe(true);
    expect(isPublicSectorRole({ title: "Enterprise Account Executive", department: "US Public Sector" }, { category: "Office of the CFO" })).toBe(true);
    expect(isPublicSectorRole({ title: "Account Executive" }, { category: "Government Technology" })).toBe(true);
    expect(isPublicSectorRole({ title: "Enterprise Account Executive" }, { category: "Office of the CFO" })).toBe(false);
  });

  it("stops when the model declines", async () => {
    create.mockResolvedValueOnce({ stop_reason: "refusal", content: [] });
    await expect(generateKit(input)).rejects.toThrow(/declined/);
  });
});

describe("Application Kit storage", () => {
  let db: PrismaClient;
  beforeAll(() => { db = testDb(); });
  afterAll(() => db.$disconnect());

  it("survives a full backup and replace", async () => {
    const c = await makeCompany(db);
    const job = await db.job.create({ data: { companyId: c.id, fingerprint: `kit-${Math.random()}`, title: "Strategic AE", applyUrl: "https://example.com/jobs/1" } });
    const kit = await db.kit.create({ data: { jobId: job.id, parts: clean, checks: {}, model: "test" } });
    const backup = JSON.parse(JSON.stringify(await exportAll(db)));
    await db.kit.delete({ where: { id: kit.id } });
    await restoreAll(db, backup, "replace");
    const back = await db.kit.findUniqueOrThrow({ where: { id: kit.id } });
    expect((back.parts as Record<string, string>).letter).toBe(clean.letter);
  });
});
