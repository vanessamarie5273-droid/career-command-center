import { describe, expect, it, vi, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";

const create = vi.fn(async (req: { messages: { content: string }[] }) => ({ stop_reason: "end_turn", content: [{ type: "text", text: `OUT ${req.messages[0].content.slice(0, 20)}` }] }));
vi.mock("@anthropic-ai/sdk", () => ({ default: class { beta = { messages: { create } }; } }));

import { checkKit, generateKit, kitContext, unsupportedFigures, KIT_PARTS, type KitInput } from "@/lib/kit";
import { exportAll, restoreAll } from "@/lib/backup";
import { testDb, makeCompany } from "./setup-db";

const RESUME = "VANESSA MORALES\nvanessa@example.com\nEXPERIENCE\nSAP, Nov 2024 – Present\n- Closed $8.5M in new and expansion revenue; earned Winners Circle 2025.\n- Expanded the account with a $1.58M TCV licensing upsell.\n- Led the team to $15.6M in closed revenue and $80.6M in pipeline; 25% increase in pipeline creation, 30% increase in conversion.";
const input: KitInput = {
  resumeText: RESUME,
  job: { title: "Strategic Account Executive", location: "Remote, US", descriptionText: "Own a $2M quota across Fortune 500 accounts. 8+ years required.", requiredQuals: null, preferredQuals: null },
  company: { name: "Acme AI", category: "Enterprise AI & Agents", maturity: "High-growth private", description: "Agents for finance teams.", keyProducts: null, customers: null, buyerPersonas: "CFO", risks: null, news: ["Raised Series C"] },
};
const ctx = kitContext(input);
const clean = Object.fromEntries(KIT_PARTS.map((p) => [p, "Your posting points to stalled pipeline. I closed $8.5M and earned Winners Circle 2025."])) as Record<(typeof KIT_PARTS)[number], string>;
clean.letter = `Throughout my nine years at SAP, I have worked across new customer acquisition. ${clean.letter}`;

describe("Application Kit checks", () => {
  it("passes text that uses only her figures and plain language", () => {
    const checks = checkKit(clean, { resumeText: RESUME, contextText: ctx });
    for (const p of KIT_PARTS) expect(checks[p]).toEqual([]);
  });

  it("flags language her brief rules out", () => {
    const checks = checkKit({ ...clean, letter: "Throughout my nine years at SAP. I am passionate about sales and grateful for the opportunity to join. I was responsible for pipeline." }, { resumeText: RESUME, contextText: ctx });
    const found = checks.letter.filter((i) => i.kind === "language").map((i) => i.text.toLowerCase());
    expect(found).toEqual(expect.arrayContaining(["passionate", "grateful", "opportunity to join", "responsible for"]));
  });

  it("flags figures that are not in her resume or profile", () => {
    const checks = checkKit({ ...clean, resume: "Closed $40M in new logos at 150% of plan. $8.5M closed." }, { resumeText: RESUME, contextText: ctx });
    expect(checks.resume.filter((i) => i.kind === "figure").map((i) => i.text)).toEqual(["$40M", "150%"]);
  });

  it("lets the point of view quote the posting, but not the resume or letter", () => {
    const quoting = "You carry a $2M quota per seller.";
    const checks = checkKit({ ...clean, pov: quoting, letter: `${clean.letter} ${quoting}` }, { resumeText: RESUME, contextText: ctx });
    expect(checks.pov).toEqual([]);
    expect(checks.letter.map((i) => i.text)).toEqual(["$2M"]);
  });

  it("passes her template once it is filled in, and flags a placeholder left behind", async () => {
    const { LETTER_TEMPLATE, LETTER_ACCOMPLISHMENTS } = await import("@/lib/letterStyle");
    const filled = LETTER_TEMPLATE.replace("[Include a relevant accomplishment based on the position.]", Object.values(LETTER_ACCOMPLISHMENTS)[0]).replace(/\[[^\]]+\]/g, "Acme");
    expect(checkKit({ ...clean, letter: filled }, { resumeText: RESUME, contextText: ctx }).letter).toEqual([]);
    const left = checkKit({ ...clean, letter: LETTER_TEMPLATE }, { resumeText: RESUME, contextText: ctx }).letter;
    expect(left.map((i) => i.text)).toContain("[Company Name]");
  });

  it("flags a letter that rewrote her fixed SAP paragraph", () => {
    const checks = checkKit({ ...clean, letter: "Dear Acme Hiring Team,\n\nAt SAP I sold software.\n\nKindest Regards,\nVanessa Morales" }, { resumeText: RESUME, contextText: ctx });
    expect(checks.letter.map((i) => i.text)).toContain("SAP paragraph changed");
  });

  it("ignores list numbers and the 30-60-90 plan", () => {
    expect(unsupportedFigures("1. First 30 days\n2. Days 31-60\n3. Days 61-90", RESUME)).toEqual([]);
  });

  it("flags long sentences and an over-long letter", () => {
    const long = `${"word ".repeat(45)}end.`;
    const checks = checkKit({ ...clean, letter: `${clean.letter} ${long} ${"more ".repeat(420)}` }, { resumeText: RESUME, contextText: ctx });
    expect(checks.letter.filter((i) => i.kind === "length")).toHaveLength(2);
  });
});

describe("Application Kit generation", () => {
  it("writes all five parts from one cached context that holds her resume and the posting", async () => {
    create.mockClear();
    const parts = await generateKit(input);
    expect(Object.keys(parts).sort()).toEqual([...KIT_PARTS].sort());
    expect(create).toHaveBeenCalledTimes(5);
    const systems = create.mock.calls.map((c) => JSON.stringify((c[0] as unknown as { system: unknown }).system));
    expect(new Set(systems).size).toBe(1);
    expect(systems[0]).toContain("Closed $8.5M in new and expansion revenue");
    expect(systems[0]).not.toContain("PROFILE FACTS");
    expect(systems[0]).toContain("Own a $2M quota");
    expect(systems[0]).toContain("ephemeral");
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
