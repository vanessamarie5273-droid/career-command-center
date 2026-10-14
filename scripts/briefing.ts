import { PrismaClient } from "@prisma/client";
import { generateAndSendBriefing } from "../src/lib/briefing";
const db = new PrismaClient();
generateAndSendBriefing(db).then((b) => { console.log(`Briefing ${b.id}: email ${b.emailStatus}`); return db.$disconnect(); });
