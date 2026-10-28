import Anthropic from "@anthropic-ai/sdk";
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

/** Plain-language responses for the Anthropic errors she can fix herself; anything else goes to route()'s handler. */
export function aiError(e: unknown) {
  if (e instanceof Anthropic.AuthenticationError) return NextResponse.json({ error: "Anthropic rejected the API key. Check ANTHROPIC_API_KEY on the web service." }, { status: 503 });
  if (e instanceof Anthropic.RateLimitError) return NextResponse.json({ error: "Anthropic is rate-limiting requests. Try again in a minute." }, { status: 503 });
  throw e;
}

export const aiNotConfigured = (feature: string) => NextResponse.json({ error: `${feature} needs ANTHROPIC_API_KEY. Add it under the web service's Environment tab.` }, { status: 503 });
