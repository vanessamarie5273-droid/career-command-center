// Her Outlook mailbox through Microsoft Graph with plain fetch: Microsoft sign-in (OAuth 2.0 with a
// refresh token), reading recruiter mail, creating drafts and sending the alert emails to herself.
// The "common" authority accepts personal outlook.com accounts and Microsoft 365 work accounts.
import type { PrismaClient } from "@prisma/client";
import { seal, unseal } from "./seal";

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

const ID = "outlook";
/** Read mail and write drafts (Mail.ReadWrite); send the alert emails to her own address (Mail.Send). */
export const SCOPES = ["openid", "email", "offline_access", "User.Read", "Mail.ReadWrite", "Mail.Send"];
const LOGIN = () => `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT || "common"}/oauth2/v2.0`;
const GRAPH = "https://graph.microsoft.com/v1.0";

export const outlookConfigured = () => !!process.env.MICROSOFT_CLIENT_ID && !!process.env.MICROSOFT_CLIENT_SECRET;

export class MailError extends Error {
  constructor(message: string, readonly reconnect = false) { super(message); }
}

export function authUrl(redirectUri: string, state: string) {
  const q = new URLSearchParams({ client_id: process.env.MICROSOFT_CLIENT_ID!, redirect_uri: redirectUri, response_type: "code", response_mode: "query", scope: SCOPES.join(" "), prompt: "select_account", state });
  return `${LOGIN()}/authorize?${q}`;
}

type Tokens = { access_token: string; refresh_token?: string; expires_in?: number; scope?: string };

async function tokenCall(body: Record<string, string>, f: Fetch): Promise<Tokens> {
  const res = await f(`${LOGIN()}/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: process.env.MICROSOFT_CLIENT_ID!, client_secret: process.env.MICROSOFT_CLIENT_SECRET!, scope: SCOPES.join(" "), ...body }), signal: AbortSignal.timeout(20000) });
  const j = (await res.json().catch(() => ({}))) as Partial<Tokens> & { error?: string; error_description?: string };
  if (!res.ok || !j.access_token) {
    const reconnect = j.error === "invalid_grant" || j.error === "interaction_required";
    throw new MailError(reconnect ? "Microsoft sign-in has expired or was revoked. Reconnect Outlook in Settings." : `Microsoft sign-in failed: ${(j.error_description || j.error || String(res.status)).split("\r")[0].slice(0, 200)}`, reconnect);
  }
  return j as Tokens;
}

const saveTokens = (t: Tokens) => ({ accessToken: seal(t.access_token), expiresAt: new Date(Date.now() + (t.expires_in ?? 3600) * 1000), ...(t.refresh_token ? { refreshToken: seal(t.refresh_token) } : {}) });

/** Finish Microsoft sign-in: trade the code for tokens and save the account. */
export async function connect(db: PrismaClient, code: string, redirectUri: string, f: Fetch = fetch) {
  const t = await tokenCall({ code, redirect_uri: redirectUri, grant_type: "authorization_code" }, f);
  const granted = (t.scope ?? "").toLowerCase().split(" ");
  if (!["mail.readwrite", "mail.send"].every((s) => granted.some((g) => g.endsWith(s)))) throw new MailError("Microsoft sign-in did not grant mailbox access. Connect again and accept the permissions on Microsoft's screen.");
  if (!t.refresh_token) throw new MailError("Microsoft did not return a refresh token. Connect again.");
  const me = (await (await f(`${GRAPH}/me?$select=mail,userPrincipalName`, { headers: { Authorization: `Bearer ${t.access_token}` } })).json().catch(() => ({}))) as { mail?: string; userPrincipalName?: string };
  const data = { email: (me.mail || me.userPrincipalName || "").toLowerCase(), refreshToken: seal(t.refresh_token), ...saveTokens(t), scopes: t.scope ?? SCOPES.join(" "), status: "connected", lastSyncNote: null };
  return db.mailAccount.upsert({ where: { id: ID }, create: { id: ID, ...data }, update: data });
}

/** Forget the tokens. (Microsoft has no revoke call for personal accounts; she can also remove the app at account.live.com/consent/Manage.) */
export async function disconnect(db: PrismaClient) {
  await db.mailAccount.deleteMany({ where: { id: ID } });
}

/** A valid access token, refreshed when within a minute of expiring. Microsoft rotates the refresh token, so the new one is saved. */
export async function accessToken(db: PrismaClient, f: Fetch = fetch) {
  const a = await db.mailAccount.findUnique({ where: { id: ID } });
  if (!a) throw new MailError("Outlook is not connected", true);
  if (a.accessToken && a.expiresAt && a.expiresAt.getTime() > Date.now() + 60_000) return unseal(a.accessToken);
  try {
    const t = await tokenCall({ refresh_token: unseal(a.refreshToken), grant_type: "refresh_token" }, f);
    await db.mailAccount.update({ where: { id: ID }, data: { ...saveTokens(t), status: "connected" } });
    return t.access_token;
  } catch (e) {
    if (e instanceof MailError && e.reconnect) await db.mailAccount.update({ where: { id: ID }, data: { status: "error", lastSyncNote: e.message } });
    throw e;
  }
}

/** A message as the sync reads it. */
export type MailMessage = { id: string; conversationId: string; subject: string; fromName: string | null; fromEmail: string; receivedAt: Date; preview: string; hasUnsubscribe?: boolean };
export type Draft = { to?: string | null; subject: string; body: string; replyToId?: string | null };

export type Mailbox = {
  email: string;
  /** Inbox and Junk messages received after `since`, newest first. */
  list(since: Date, max: number): Promise<MailMessage[]>;
  /** The message body as plain text. */
  body(id: string): Promise<string>;
  /** Saves a draft (a reply in the thread when replyToId is given) and returns its Outlook web link. */
  draft(d: Draft): Promise<{ id: string; webLink: string | null }>;
  /** Sends an HTML email (the alerts and briefing, to her own address). */
  send(to: string, subject: string, html: string): Promise<void>;
};

type GraphMessage = { id: string; conversationId: string; subject?: string; from?: { emailAddress?: { name?: string; address?: string } }; receivedDateTime: string; bodyPreview?: string };

/** A client for the connected mailbox, or null when Outlook is not connected or not configured. */
export async function mailbox(db: PrismaClient, f: Fetch = fetch): Promise<Mailbox | null> {
  const acct = await db.mailAccount.findUnique({ where: { id: ID } });
  if (!acct || !outlookConfigured()) return null;
  const call = async <T>(url: string, init?: RequestInit & { prefer?: string }): Promise<T> => {
    const token = await accessToken(db, f);
    const res = await f(url.startsWith("http") ? url : `${GRAPH}${url}`, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.prefer ? { Prefer: init.prefer } : {}) }, signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new MailError(`Outlook ${res.status}: ${(await res.text()).slice(0, 200)}`, res.status === 401);
    return (res.status === 202 || res.status === 204 ? {} : await res.json()) as T;
  };
  const toMessage = (m: GraphMessage): MailMessage => ({ id: m.id, conversationId: m.conversationId, subject: m.subject ?? "", fromName: m.from?.emailAddress?.name?.trim() || null, fromEmail: (m.from?.emailAddress?.address ?? "").toLowerCase(), receivedAt: new Date(m.receivedDateTime), preview: m.bodyPreview ?? "" });
  return {
    email: acct.email,
    async list(since, max) {
      const out: MailMessage[] = [];
      for (const folder of ["inbox", "junkemail"]) {
        const q = new URLSearchParams({ $filter: `receivedDateTime ge ${since.toISOString()}`, $orderby: "receivedDateTime desc", $select: "id,conversationId,subject,from,receivedDateTime,bodyPreview", $top: "50" });
        let next: string | undefined = `/me/mailFolders/${folder}/messages?${q}`;
        while (next && out.length < max) {
          const r: { value?: GraphMessage[]; "@odata.nextLink"?: string } = await call(next);
          out.push(...(r.value ?? []).map(toMessage));
          next = r["@odata.nextLink"];
        }
      }
      return out.sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime()).slice(0, max);
    },
    async body(id) {
      const r = await call<{ body?: { content?: string } }>(`/me/messages/${id}?$select=body`, { prefer: 'outlook.body-content-type="text"' });
      return (r.body?.content ?? "").replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
    },
    async draft(d) {
      if (d.replyToId) {
        // Reply in the recruiter's thread; Outlook keeps the quoted message under her text.
        const r = await call<{ id: string; webLink?: string }>(`/me/messages/${d.replyToId}/createReply`, { method: "POST", body: JSON.stringify({ comment: d.body }) });
        return { id: r.id, webLink: r.webLink ?? null };
      }
      const r = await call<{ id: string; webLink?: string }>("/me/messages", { method: "POST", body: JSON.stringify({ subject: d.subject, body: { contentType: "Text", content: d.body }, toRecipients: d.to ? [{ emailAddress: { address: d.to } }] : [] }) });
      return { id: r.id, webLink: r.webLink ?? null };
    },
    async send(to, subject, html) {
      await call("/me/sendMail", { method: "POST", body: JSON.stringify({ message: { subject, body: { contentType: "HTML", content: html }, toRecipients: [{ emailAddress: { address: to } }] }, saveToSentItems: false }) });
    },
  };
}

export const OUTLOOK_DRAFTS = "https://outlook.live.com/mail/0/drafts";
