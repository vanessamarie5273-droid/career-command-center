// Starts Microsoft sign-in for her Outlook mailbox.
import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth";
import { authUrl, outlookConfigured } from "@/lib/mail/outlook";
import { STATE_COOKIE, appOrigin, redirectUri } from "../origin";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try { await requireUser("EDITOR"); } catch (e) { if (e instanceof AuthError) return NextResponse.redirect(`${appOrigin(req)}/login`); throw e; }
  if (!outlookConfigured()) return NextResponse.redirect(`${appOrigin(req)}/settings?outlook_error=${encodeURIComponent("Add MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET to the web service first (see SETUP.md).")}#outlook`);
  const state = randomBytes(24).toString("hex");
  const res = NextResponse.redirect(authUrl(redirectUri(req), state));
  res.cookies.set(STATE_COOKIE, state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/mail", maxAge: 600 });
  return res;
}
