import { PrismaClient } from "@prisma/client";
import { rescoreAll } from "../src/lib/ingest/run";
const db = new PrismaClient();
rescoreAll(db).then((n) => { console.log(`Rescored ${n} jobs`); return db.$disconnect(); });
