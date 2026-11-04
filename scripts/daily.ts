// Scheduled daily job: refresh every company feed (revalidating open listings and closing removed ones),
// rescore, read Outlook for recruiter replies, then generate and email the morning briefing from the refreshed records.
import { PrismaClient } from "@prisma/client";
import { runIngestion, rescoreAll } from "../src/lib/ingest/run";
import { generateAndSendBriefing } from "../src/lib/briefing";
import { syncMailbox } from "../src/lib/mail/sync";
import { clearStaleTodos } from "../src/lib/todos";
import { seed } from "./seed";
import { relinkContacts } from "../src/lib/network";
const db = new PrismaClient();
(async () => {
  await seed(db); // picks up companies added to the seed list in new releases
  console.log(`Network: ${await relinkContacts(db)} connections relinked to tracked companies`);
  const r = await runIngestion(db, { trigger: "cron" });
  console.log(`Ingestion ${r.status}: ${r.created} new, ${r.updated} updated, ${r.closed} closed, ${r.errors} errors across ${r.companies} companies`);
  await rescoreAll(db);
  const m = await syncMailbox(db).catch((e: Error) => ({ note: `failed: ${e.message}` }));
  const st = await clearStaleTodos(db).catch((e: Error) => ({ actions: 0, tasks: 0, error: e.message }));
  console.log(`Stale to-dos: cleared ${st.actions} next actions and ${st.tasks} tasks`);
  console.log(`Outlook: ${m ? m.note : "not connected"}`);
  const b = await generateAndSendBriefing(db);
  console.log(`Briefing ${b.id}: email ${b.emailStatus}`);
  await db.$disconnect();
})().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
