// Microsoft sends her back here after sign-in: save the mailbox, read the last three weeks, return to Settings.
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { requireUser, AuthError } from "@/lib/auth";
import { connect } from "@/lib/mail/outlook";
import { syncMailbox } from "@/lib/mail/sync";
import { STATE_COOKIE, appOrigin, redirectUri } from "../origin";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const back = (q: string) => { const r = NextResponse.redirect(`${appOrigin(req)}/settings?${q}#outlook`); r.cookies.delete({ name: STATE_COOKIE, path: "/api/mail" }); return r; };
  let user;
  try { user = await requireUser("EDITOR"); } catch (e) { if (e instanceof AuthError) return NextResponse.redirect(`${appOrigin(req)}/login`); throw e; }
  const url = new URL(req.url);
  const err = url.searchParams.get("error_description") || url.searchParams.get("error");
  if (err) return back(`outlook_error=${encodeURIComponent(err.split(/\r?\n/)[0].slice(0, 200))}`);
  const state = url.searchParams.get("state") ?? "", saved = (await cookies()).get(STATE_COOKIE)?.value ?? "";
  if (!state || state.length !== saved.length || !timingSafeEqual(Buffer.from(state), Buffer.from(saved))) return back(`outlook_error=${encodeURIComponent("The sign-in link expired. Click Connect Outlook again.")}`);
  try {
    const acct = await connect(prisma, url.searchParams.get("code") ?? "", redirectUri(req));
    await prisma.auditLog.create({ data: { userId: user.sub, entity: "MailAccount", entityId: acct.id, action: "connect", changes: { email: acct.email } } });
    const r = await syncMailbox(prisma, { max: 200 }).catch((e: Error) => ({ note: `First check failed: ${e.message}` }));
    return back(`outlook=connected&note=${encodeURIComponent(r?.note ?? "")}`);
  } catch (e) {
    return back(`outlook_error=${encodeURIComponent((e as Error).message.slice(0, 300))}`);
  }
}
