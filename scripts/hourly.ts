// Scheduled hourly job (daytime, Arizona): refresh every company feed, rescore, email any new
// high-fit role straight away, and read Outlook for recruiter replies. The 6 AM daily job does the same
// plus the morning briefing.
import { PrismaClient } from "@prisma/client";
import { runIngestion, rescoreAll } from "../src/lib/ingest/run";
import { sendInstantAlerts } from "../src/lib/instantAlerts";
import { syncMailbox } from "../src/lib/mail/sync";
const db = new PrismaClient();
(async () => {
  const r = await runIngestion(db, { trigger: "hourly" });
  console.log(`Ingestion ${r.status}: ${r.created} new, ${r.updated} updated, ${r.closed} closed, ${r.errors} errors across ${r.companies} companies`);
  await rescoreAll(db);
  const a = await sendInstantAlerts(db);
  console.log(`Instant alerts: ${a.sent} sent (${a.detail})`);
  const m = await syncMailbox(db).catch((e: Error) => ({ note: `failed: ${e.message}` }));
  console.log(`Outlook: ${m ? m.note : "not connected"}`);
  await db.$disconnect();
})().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
