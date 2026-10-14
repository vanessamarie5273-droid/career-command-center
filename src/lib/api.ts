import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthError, requireUser } from "./auth";

type Level = "VIEWER" | "EDITOR" | "ADMIN";

/** Route-handler wrapper: auth + role check + uniform error handling. */
export function route<C = unknown>(level: Level, fn: (req: Request, ctx: C, user: Awaited<ReturnType<typeof requireUser>>) => Promise<Response | object>) {
  return async (req: Request, ctx: C) => {
    try {
      const user = await requireUser(level);
      const out = await fn(req, ctx, user);
      return out instanceof Response ? out : NextResponse.json(out);
    } catch (e) {
      if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
      if (e instanceof ZodError) return NextResponse.json({ error: "Invalid input", issues: e.issues }, { status: 400 });
      console.error(e);
      return NextResponse.json({ error: (e as Error).message || "Server error" }, { status: 500 });
    }
  };
}
