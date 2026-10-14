// Usage: ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='long passphrase' npm run user:create
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
const db = new PrismaClient();
(async () => {
  const email = (process.env.ADMIN_EMAIL || process.argv[2] || "").toLowerCase().trim();
  const password = process.env.ADMIN_PASSWORD || process.argv[3] || "";
  const role = (process.env.ADMIN_ROLE || "ADMIN") as "ADMIN" | "EDITOR" | "VIEWER";
  if (!email || password.length < 12) { console.error("Provide ADMIN_EMAIL and ADMIN_PASSWORD (12+ characters)."); process.exit(1); }
  const passwordHash = await bcrypt.hash(password, 12);
  const u = await db.user.upsert({ where: { email }, create: { email, passwordHash, role, alertEmail: email }, update: { passwordHash, role, failedLogins: 0, lockedUntil: null } });
  console.log(`User ready: ${u.email} (${u.role})`);
  await db.$disconnect();
})();
