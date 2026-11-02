import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { legacyMatchCompany, matchCompany } from "@/lib/linkedin";
import { effectiveCompanyId, loadNetwork, personType, referralNote, relinkContacts } from "@/lib/network";
import { makeCompany, testDb } from "./setup-db";

const cos = [
  { id: "vanta", name: "Vanta" }, { id: "axon", name: "Axon" }, { id: "euna", name: "Euna Solutions" }, { id: "paradigm", name: "Paradigm Health" },
  { id: "aws", name: "Amazon Web Services" }, { id: "gcp", name: "Google Cloud" }, { id: "workday", name: "Workday" }, { id: "coupa", name: "Coupa" },
];

describe("matching connections to tracked companies", () => {
  it("does not link employers that only share letters", () => {
    for (const n of ["VantagePoint Business Solutions", "Axonius", "e&", "Paradigm Technology"]) expect(matchCompany(n, cos), n).toBeNull();
    // The old matcher did, which is why imported links are re-checked.
    expect(legacyMatchCompany("VantagePoint Business Solutions", cos)?.id).toBe("vanta");
  });

  it("still links divisions, parents and legal suffixes", () => {
    expect(matchCompany("Amazon Web Services (AWS)", cos)?.id).toBe("aws");
    expect(matchCompany("Amazon", cos)?.id).toBe("aws");
    expect(matchCompany("Google", cos)?.id).toBe("gcp");
    expect(matchCompany("Workday VNDLY", cos)?.id).toBe("workday");
    expect(matchCompany("Coupa Software", cos)?.id).toBe("coupa");
  });

  it("keeps a company she set by hand, and fixes one the old importer set", () => {
    const base = { source: "linkedin_export", companyName: "VantagePoint Business Solutions" };
    expect(effectiveCompanyId({ ...base, companyId: "vanta" }, cos)).toBeNull();
    expect(effectiveCompanyId({ ...base, companyId: "coupa" }, cos)).toBe("coupa");
    expect(effectiveCompanyId({ ...base, companyName: "Workday", companyId: null }, cos)).toBe("workday");
    expect(effectiveCompanyId({ source: "manual", companyName: "Workday", companyId: null }, cos)).toBeNull();
  });
});

describe("who a connection is", () => {
  it.each([
    ["Senior Talent Acquisition Partner", "recruiter"], ["Technical Recruiter", "recruiter"],
    ["Vice President of Sales Cloud ERP", "leader"], ["Sales Manager", "leader"], ["Head of Sales Development", "leader"],
    ["Senior Enterprise Account Executive", "sales"], ["Strategic Account Manager", "sales"], ["Solutions Engineer", "sales"],
    ["Founder & CEO", "exec"], ["Chief Revenue Officer (CRO)", "exec"], ["Vice President, Manufacturing Industries", "exec"],
    ["Data Architect", "other"], [null, "other"],
  ])("%s → %s", (title, type) => expect(personType(title)).toBe(type));
});

describe("referral note", () => {
  it("names the opening and uses resume facts only", () => {
    const t = referralNote({ first: "Ana", company: "Databricks", type: "sales", role: "Enterprise Account Executive" });
    expect(t).toMatch(/^Hi Ana,/);
    expect(t).toContain("Databricks is hiring an Enterprise Account Executive, and I'm going after it");
    expect(t).toContain("$8.5M");
    expect(t).not.toMatch(/passionate|grateful/i);
  });
  it("says she applied when she has", () => {
    expect(referralNote({ first: "Jo", company: "Oracle", type: "recruiter", role: "AE", applied: true })).toContain("I applied for the AE role at Oracle");
  });
});

describe("My Network data", () => {
  let db: PrismaClient;
  beforeAll(async () => { db = testDb(); });
  afterAll(async () => { await db.$disconnect(); });

  it("relinks imported connections and finds the openings inside their companies", async () => {
    const vanta = await makeCompany(db, { name: "Vanta" });
    const acme = await makeCompany(db, { name: "Acme Cloud" });
    await db.job.create({ data: { companyId: acme.id, fingerprint: `acme-${Math.random()}`, title: "Enterprise Account Executive", applyUrl: "https://acme.test/j", category: "MAIN", score: 88 } });
    const wrong = await db.contact.create({ data: { firstName: "Pat", companyName: "VantagePoint Business Solutions", companyId: vanta.id, source: "linkedin_export", title: "Recruiter" } });
    const right = await db.contact.create({ data: { firstName: "Lee", companyName: "Acme Cloud Inc.", source: "linkedin_export", title: "Talent Acquisition Partner" } });

    const net = await loadNetwork(db);
    const lee = net.people.find((p) => p.id === right.id)!;
    expect(lee.companyId).toBe(acme.id);
    expect(lee.type).toBe("recruiter");
    expect(net.companies.get(acme.id)?.roles.map((r) => r.title)).toEqual(["Enterprise Account Executive"]);
    expect(net.people.find((p) => p.id === wrong.id)?.companyId).toBeNull();

    expect(await relinkContacts(db)).toBeGreaterThanOrEqual(2);
    expect((await db.contact.findUnique({ where: { id: wrong.id } }))?.companyId).toBeNull();
    expect((await db.contact.findUnique({ where: { id: right.id } }))?.companyId).toBe(acme.id);
  });
});
