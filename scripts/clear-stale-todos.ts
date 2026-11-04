// Clears to-dos left over from earlier status changes. Runs on every deploy and in the scheduled jobs.
import { PrismaClient } from "@prisma/client";
import { clearStaleTodos } from "../src/lib/todos";
const db = new PrismaClient();
(async () => {
  const r = await clearStaleTodos(db);
  console.log(`Stale to-dos: cleared ${r.actions} next actions and ${r.tasks} tasks`);
  await db.$disconnect();
})().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
