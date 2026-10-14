// Scheduled daily job: refresh every company feed (revalidating open listings and closing removed ones),
// rescore, then generate and email the morning briefing from the refreshed records.
import { PrismaClient } from "@prisma/client";
import { runIngestion, rescoreAll } from "../src/lib/ingest/run";
import { generateAndSendBriefing } from "../src/lib/briefing";
import { seed } from "./seed";
const db = new PrismaClient();
(async () => {
  await seed(db); // picks up companies added to the seed list in new releases
  const r = await runIngestion(db, { trigger: "cron" });
  console.log(`Ingestion ${r.status}: ${r.created} new, ${r.updated} updated, ${r.closed} closed, ${r.errors} errors across ${r.companies} companies`);
  await rescoreAll(db);
  const b = await generateAndSendBriefing(db);
  console.log(`Briefing ${b.id}: email ${b.emailStatus}`);
  await db.$disconnect();
})().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
