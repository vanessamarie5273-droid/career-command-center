// Full-fidelity JSON backup and restore of every table. Files are base64-encoded inside the backup.
import { Prisma, type PrismaClient } from "@prisma/client";

export const BACKUP_VERSION = 1;

// Dependency order for inserts (reverse for deletes).
const ORDER = ["user", "profile", "company", "leader", "companyNews", "job", "jobSource", "jobEvent", "document", "kit", "contact", "application", "stageChange", "task", "activity", "outreachTouch", "alert", "briefing", "ingestionRun", "integrationStatus", "auditLog", "savedFilter"] as const;
type Table = (typeof ORDER)[number];
const JSON_FIELDS: Partial<Record<Table, string[]>> = { job: ["scoreBreakdown", "scoreReasons"], document: ["atsReport"], kit: ["parts", "checks"], ingestionRun: ["log"], auditLog: ["changes"] };

type Delegate = { findMany: (a?: object) => Promise<Record<string, unknown>[]>; createMany: (a: { data: object[]; skipDuplicates?: boolean }) => Promise<{ count: number }>; deleteMany: (a?: object) => Promise<{ count: number }> };
const d = (db: PrismaClient | Prisma.TransactionClient, t: Table) => (db as unknown as Record<Table, Delegate>)[t];

export async function exportAll(db: PrismaClient) {
  const tables: Record<string, unknown[]> = {};
  for (const t of ORDER) {
    const rows = await d(db, t).findMany();
    tables[t] = t === "document" ? rows.map((r) => ({ ...r, data: Buffer.from(r.data as Uint8Array).toString("base64") })) : rows;
  }
  const appDocs = await db.application.findMany({ select: { id: true, documents: { select: { id: true } } } });
  tables.applicationDocuments = appDocs.flatMap((a) => a.documents.map((x) => ({ applicationId: a.id, documentId: x.id })));
  return { app: "career-command-center", version: BACKUP_VERSION, exportedAt: new Date().toISOString(), counts: Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length])), tables };
}

export type Backup = Awaited<ReturnType<typeof exportAll>>;

function revive(t: Table, row: Record<string, unknown>) {
  const r = { ...row };
  if (t === "document" && typeof r.data === "string") r.data = Buffer.from(r.data, "base64");
  for (const f of JSON_FIELDS[t] ?? []) if (r[f] === null || r[f] === undefined) r[f] = Prisma.DbNull;
  return r;
}

/** mode "merge" adds records that are missing (existing ids are kept); "replace" wipes the database first. */
export async function restoreAll(db: PrismaClient, backup: Backup, mode: "merge" | "replace" = "merge") {
  if (backup?.app !== "career-command-center" || !backup.tables) throw new Error("Not a Career Command Center backup file");
  if (backup.version > BACKUP_VERSION) throw new Error(`Backup version ${backup.version} is newer than this app supports`);
  const counts: Record<string, number> = {};
  await db.$transaction(async (tx) => {
    if (mode === "replace") for (const t of [...ORDER].reverse()) if (t !== "user") await d(tx, t).deleteMany();
    for (const t of ORDER) {
      const rows = (backup.tables[t] as Record<string, unknown>[] | undefined) ?? [];
      if (!rows.length) continue;
      let n = 0;
      for (let i = 0; i < rows.length; i += 500) n += (await d(tx, t).createMany({ data: rows.slice(i, i + 500).map((r) => revive(t, r)), skipDuplicates: true })).count;
      counts[t] = n;
    }
    for (const link of (backup.tables.applicationDocuments as { applicationId: string; documentId: string }[] | undefined) ?? []) {
      await tx.application.update({ where: { id: link.applicationId }, data: { documents: { connect: { id: link.documentId } } } }).catch(() => undefined);
    }
  }, { timeout: 600_000, maxWait: 30_000 });
  return counts;
}

export function toCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => { const s = v == null ? "" : v instanceof Date ? v.toISOString() : typeof v === "object" ? JSON.stringify(v) : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}
