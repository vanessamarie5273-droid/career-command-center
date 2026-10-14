import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { prisma } from "./db";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSession, verifySession, type SessionPayload } from "./session";

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 12);
}

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

export async function authenticate(email: string, password: string): Promise<{ ok: true; user: SessionPayload } | { ok: false; error: string }> {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  // Same message for unknown user and bad password.
  const generic = { ok: false as const, error: "Invalid email or password." };
  if (!user) {
    await bcrypt.compare(password, "$2a$12$abcdefghijklmnopqrstuuJ0cDYZ6HN9rXNFmZ8l9gBdpO1Wm9n7a"); // timing parity
    return generic;
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return { ok: false, error: "Too many attempts. Try again in a few minutes." };
  }
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    const failed = user.failedLogins + 1;
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLogins: failed, lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null },
    });
    return generic;
  }
  await prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
  await prisma.auditLog.create({ data: { userId: user.id, entity: "User", entityId: user.id, action: "login" } });
  return { ok: true, user: { sub: user.id, email: user.email, role: user.role } };
}

export async function startSession(p: SessionPayload) {
  const token = await signSession(p);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function endSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function getSession() {
  return verifySession((await cookies()).get(SESSION_COOKIE)?.value);
}

export class AuthError extends Error {
  constructor(public status: number, msg: string) {
    super(msg);
  }
}

/** Role-based guard. VIEWER may read; EDITOR/ADMIN may write; ADMIN for settings/restore. */
export async function requireUser(min: "VIEWER" | "EDITOR" | "ADMIN" = "VIEWER") {
  const s = await getSession();
  if (!s) throw new AuthError(401, "Not signed in");
  const rank = { VIEWER: 0, EDITOR: 1, ADMIN: 2 } as const;
  if (rank[s.role] < rank[min]) throw new AuthError(403, "Insufficient permissions");
  return s;
}
