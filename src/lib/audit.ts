import { prisma } from "./db";

export async function audit(userId: string | null, entity: string, entityId: string, action: string, changes?: unknown) {
  await prisma.auditLog.create({ data: { userId, entity, entityId, action, changes: changes === undefined ? undefined : (JSON.parse(JSON.stringify(changes)) as object) } });
}

/** Diff two flat objects for the audit trail. */
export function diff(before: Record<string, unknown>, after: Record<string, unknown>) {
  const out: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of Object.keys(after)) {
    const a = before[k] instanceof Date ? (before[k] as Date).toISOString() : before[k];
    const b = after[k] instanceof Date ? (after[k] as Date).toISOString() : after[k];
    if (JSON.stringify(a) !== JSON.stringify(b)) out[k] = { from: a ?? null, to: b ?? null };
  }
  return out;
}
