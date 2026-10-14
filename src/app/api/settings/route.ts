import bcrypt from "bcryptjs";
import { z } from "zod";
import { route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { rescoreAll } from "@/lib/ingest/run";

export const PATCH = route("EDITOR", async (req, _c, u) => {
  const b = z.object({ alertEmail: z.string().email().nullable().optional(), alertMinScore: z.union([z.number(), z.string()]).transform(Number).refine((n) => n >= 0 && n <= 100).optional(), name: z.string().max(100).nullable().optional() }).parse(await req.json());
  await prisma.user.update({ where: { id: u.sub }, data: b });
  return { ok: true };
});

export const POST = route("VIEWER", async (req, _c, u) => {
  const b = z.object({ action: z.enum(["password", "rescore"]), current: z.string().optional(), next: z.string().optional() }).parse(await req.json());
  if (b.action === "rescore") return { rescored: await rescoreAll(prisma) };
  const user = await prisma.user.findUniqueOrThrow({ where: { id: u.sub } });
  if (!b.current || !(await bcrypt.compare(b.current, user.passwordHash))) return Response.json({ error: "Current password is incorrect" }, { status: 400 });
  if (!b.next || b.next.length < 12) return Response.json({ error: "New password must be at least 12 characters" }, { status: 400 });
  await prisma.user.update({ where: { id: u.sub }, data: { passwordHash: await hashPassword(b.next) } });
  await prisma.auditLog.create({ data: { userId: u.sub, entity: "User", entityId: u.sub, action: "password_change" } });
  return { ok: true };
});
