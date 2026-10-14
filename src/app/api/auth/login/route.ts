import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate, startSession } from "@/lib/auth";

const Body = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(500) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid email or password." }, { status: 400 });
  const r = await authenticate(parsed.data.email, parsed.data.password);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 401 });
  await startSession(r.user);
  return NextResponse.json({ ok: true });
}
