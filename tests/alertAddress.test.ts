import { describe, expect, it, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { alertAddress } from "@/lib/notify";
import { testDb } from "./setup-db";

describe("alert address", () => {
  let db: PrismaClient;
  beforeAll(async () => { db = testDb(); if (!(await db.user.count())) await db.user.create({ data: { email: "v@example.com", passwordHash: "x" } }); });
  afterAll(() => db.$disconnect());

  it("sends to the connected Outlook mailbox even when an older setting holds a Gmail address", async () => {
    await db.user.updateMany({ data: { alertEmail: "someone@gmail.com" } });
    await db.mailAccount.deleteMany({ where: { id: "outlook" } });
    expect((await alertAddress(db)).to).toBe("someone@gmail.com");
    await db.mailAccount.create({ data: { id: "outlook", email: "me@outlook.com", refreshToken: "x", scopes: "Mail.Read" } });
    expect((await alertAddress(db)).to).toBe("me@outlook.com");
    await db.mailAccount.deleteMany({ where: { id: "outlook" } });
    await db.user.updateMany({ data: { alertEmail: null } });
  });
});
