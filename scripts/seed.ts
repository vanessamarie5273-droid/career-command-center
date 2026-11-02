// Seeds the company universe and profile. Idempotent: existing companies keep user edits;
// only empty fields are filled from the seed.
import { PrismaClient } from "@prisma/client";
import { SEED_COMPANIES } from "../src/data/companies";
import { PROFILE } from "../src/lib/profile";

const db = new PrismaClient();

function careersFor(c: (typeof SEED_COMPANIES)[number]) {
  if (c.careers) return c.careers;
  const gh = c.hints?.find((h) => h.startsWith("greenhouse:"));
  if (gh) return `https://job-boards.greenhouse.io/${gh.slice(11)}`;
  const ash = c.hints?.find((h) => h.startsWith("ashby:"));
  if (ash) return `https://jobs.ashbyhq.com/${ash.slice(6)}`;
  const lv = c.hints?.find((h) => h.startsWith("lever:"));
  if (lv) return `https://jobs.lever.co/${lv.slice(6)}`;
  return `${c.website.replace(/\/$/, "")}/careers`;
}

export async function seed(client = db) {
  let created = 0;
  for (const c of SEED_COMPANIES) {
    const host = new URL(c.website).hostname.replace(/^www\./, "");
    const data = {
      name: c.name, website: c.website, careersUrl: careersFor(c),
      logoUrl: `https://www.google.com/s2/favicons?domain=${host}&sz=128`,
      linkedinUrl: `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(c.name)}`,
      category: c.category, headquarters: c.hq, ownership: c.ownership, ticker: c.ticker ?? null, maturity: c.maturity,
      description: c.description, keyProducts: c.products, buyerPersonas: c.buyers,
      profileFactType: "AI_ASSESSMENT" as const, profileSource: "AI-compiled from model knowledge (mid-2026); not yet verified",
      marketPositionScore: c.mp, equityUpsideScore: c.eq, compCompetitiveness: c.cc, growthScore: c.growth ?? null, growthThesis: c.thesis ?? null,
      risks: c.risks ?? null, atsHints: c.hints ?? [], addedBy: c.seed ? "seed:vanessa" : "seed:research",
    };
    const existing = await client.company.findUnique({ where: { slug: c.slug } });
    if (!existing) {
      await client.company.create({ data: { slug: c.slug, ...data, leaders: c.ceo ? { create: { name: c.ceo, title: "Chief Executive Officer", factType: "AI_ASSESSMENT", linkedinUrl: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${c.ceo} ${c.name}`)}` } } : undefined } });
      created++;
    } else {
      const fill: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(data)) if ((existing as unknown as Record<string, unknown>)[k] == null || (Array.isArray(v) && !((existing as unknown as Record<string, unknown[]>)[k]?.length))) fill[k] = v;
      // New feed hints reach companies that have no working board yet; a board found or set by hand is kept.
      const hints = c.hints ?? [];
      if (existing.atsProvider === "NONE" && hints.length && JSON.stringify(existing.atsHints) !== JSON.stringify(hints)) Object.assign(fill, { atsHints: hints, atsStatus: "pending", atsError: null });
      if (Object.keys(fill).length) await client.company.update({ where: { id: existing.id }, data: fill });
    }
  }
  await client.profile.upsert({
    where: { id: "me" },
    create: { id: "me", summary: PROFILE.summary, targetRoles: PROFILE.targetRoles, keywords: Object.values(PROFILE.strengths).flat(), homeBase: PROFILE.homeBase, preferences: { remoteUS: true, southwest: true, hybridPhoenix: true, relocationSeparate: true, excludeClearance: true } },
    update: {},
  });
  for (const id of ["email", "anthropic", "linkedin", "storage"]) {
    await client.integrationStatus.upsert({ where: { id }, update: {}, create: { id, name: id, status: "not_configured", detail: "Not yet checked" } });
  }
  return { total: SEED_COMPANIES.length, created };
}

if (process.argv[1]?.endsWith("seed.ts")) {
  seed().then((r) => { console.log(`Seeded companies: ${r.created} new of ${r.total}`); return db.$disconnect(); }).catch((e) => { console.error(e); process.exit(1); });
}
