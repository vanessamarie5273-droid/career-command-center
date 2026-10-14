import { PrismaClient } from "@prisma/client";
import { runIngestion } from "../src/lib/ingest/run";
const db = new PrismaClient();
runIngestion(db, { trigger: "cli" }).then((r) => {
  console.log(JSON.stringify({ status: r.status, companies: r.companies, fetched: r.fetched, relevant: r.relevant, created: r.created, updated: r.updated, closed: r.closed, errors: r.errors }, null, 2));
  for (const o of r.outcomes.filter((o) => o.status !== "ok")) console.log(`  ${o.status.padEnd(11)} ${o.company}: ${o.error ?? ""}`);
  return db.$disconnect();
});
