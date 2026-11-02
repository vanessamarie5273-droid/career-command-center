// The web address the app is served at, for links in emails sent by the cron jobs. APP_URL wins when set;
// otherwise the address the web app last saw itself at, recorded when she opens it, so links work with no setup.
import type { PrismaClient } from "@prisma/client";

const ID = "app_url";
let remembered: string | null = null;

export function originFrom(host: string | null, proto: string | null) {
  if (!host || /^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|$)/.test(host)) return null;
  return `${proto?.split(",")[0] || "https"}://${host}`;
}

export async function rememberAppUrl(db: PrismaClient, origin: string | null) {
  if (!origin || origin === remembered) return;
  remembered = origin;
  await db.integrationStatus.upsert({ where: { id: ID }, create: { id: ID, name: "Web address", status: "connected", detail: origin }, update: { detail: origin, checkedAt: new Date() } }).catch(() => {});
}

export async function appBase(db: PrismaClient) {
  const env = process.env.APP_URL || process.env.RENDER_EXTERNAL_URL;
  if (env) return env.replace(/\/+$/, "");
  const row = await db.integrationStatus.findUnique({ where: { id: ID } }).catch(() => null);
  return row?.detail ?? "";
}
