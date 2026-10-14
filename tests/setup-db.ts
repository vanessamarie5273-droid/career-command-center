import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

export const TEST_DB = process.env.TEST_DATABASE_URL || "postgresql://postgres@localhost:5432/ccc_test";
let migrated = false;

export function testDb() {
  if (!migrated) {
    execSync("npx prisma migrate reset --force --skip-seed --skip-generate", { env: { ...process.env, DATABASE_URL: TEST_DB, PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION: "yes" }, stdio: "ignore" });
    migrated = true;
  }
  return new PrismaClient({ datasourceUrl: TEST_DB });
}

export async function makeCompany(db: PrismaClient, over: Record<string, unknown> = {}) {
  return db.company.create({ data: { slug: `testco-${Math.random().toString(36).slice(2, 8)}`, name: "TestCo", category: "Enterprise AI & Agents", ownership: "Private", maturity: "High-growth private", marketPositionScore: 85, equityUpsideScore: 85, compCompetitiveness: 85, atsProvider: "GREENHOUSE", atsToken: "testco", ...over } });
}
