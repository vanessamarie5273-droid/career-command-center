import { describe, expect, it, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { ensureDescription, jsonLdDescription } from "@/lib/jobDescription";
import { testDb, makeCompany } from "./setup-db";

const FULL = `<p>About the role</p><p>${"Own executive relationships in named public sector accounts. ".repeat(20)}</p><h3>Minimum requirements</h3><ul><li>5+ years of full-cycle closing sales</li><li>C-Level relationships</li></ul>`;

describe("full job description before a kit", () => {
  let db: PrismaClient;
  beforeAll(() => { db = testDb(); });
  afterAll(() => db.$disconnect());

  const job = async (descriptionText: string | null, source?: { provider: string; externalId: string }) => {
    const c = await makeCompany(db);
    const j = await db.job.create({ data: { companyId: c.id, fingerprint: `jd-${Math.random()}`, title: "Enterprise AE - Public Sector", applyUrl: "https://careers.example.com/roles/1", descriptionText } });
    if (source) await db.jobSource.create({ data: { jobId: j.id, url: j.applyUrl, ...source } });
    return j;
  };

  it("reads the description from a job page's JobPosting JSON-LD", () => {
    const page = `<html><script type="application/ld+json">{"@context":"https://schema.org","@type":"JobPosting","title":"AE","description":"<p>Sell.</p>"}</script></html>`;
    expect(jsonLdDescription(page)).toBe("<p>Sell.</p>");
    expect(jsonLdDescription("<html></html>")).toBeNull();
  });

  it("fetches the Greenhouse detail when a job has no description, and stores it", async () => {
    const j = await job(null, { provider: "GREENHOUSE", externalId: "samsara:8306291" });
    const urls: string[] = [];
    const words = await ensureDescription(db, j.id, async (url) => { urls.push(url); return new Response(JSON.stringify({ content: FULL.replace(/</g, "&lt;").replace(/>/g, "&gt;") }), { status: 200 }); });
    expect(urls).toEqual(["https://boards-api.greenhouse.io/v1/boards/samsara/jobs/8306291"]);
    expect(words).toBeGreaterThan(150);
    const saved = await db.job.findUniqueOrThrow({ where: { id: j.id } });
    expect(saved.descriptionText).toContain("Own executive relationships");
    expect(saved.requiredQuals).toContain("C-Level relationships");
  });

  it("falls back to the posting page, and leaves a full description alone", async () => {
    const thin = await job("Sell software.");
    const page = `<script type="application/ld+json">${JSON.stringify({ "@type": "JobPosting", description: FULL })}</script>`;
    expect(await ensureDescription(db, thin.id, async () => new Response(page, { status: 200 }))).toBeGreaterThan(150);

    const full = await job("word ".repeat(200));
    let called = false;
    await ensureDescription(db, full.id, async () => { called = true; return new Response("", { status: 200 }); });
    expect(called).toBe(false);
  });

  it("uses the description saved on her application when the posting is gone", async () => {
    const j = await job(null, { provider: "GREENHOUSE", externalId: "gone:1" });
    await db.application.create({ data: { companyId: j.companyId, jobId: j.id, title: j.title, jdSnapshot: "Own the Texas public sector territory. ".repeat(30) } });
    expect(await ensureDescription(db, j.id, async () => new Response("not found", { status: 404 }))).toBeGreaterThan(150);
    expect((await db.job.findUniqueOrThrow({ where: { id: j.id } })).descriptionText).toContain("Texas public sector");
  });
});
