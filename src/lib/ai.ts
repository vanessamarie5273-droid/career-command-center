// Which Claude model the app uses, and what happens when Anthropic stops answering (credit ran out, key expired).
// The choice lives in the database so she can switch it on the Settings page, with no hosting change.
import Anthropic from "@anthropic-ai/sdk";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "./db";

export const AI_MODELS = { saver: "claude-haiku-5-5", full: "claude-opus-5-5" } as const;
export type AiMode = keyof typeof AI_MODELS;
export const AI_MODE_LABEL: Record<AiMode, string> = { saver: "Credit saver (Haiku)", full: "Full quality (Opus)" };
/** Saver until she picks otherwise (credit was nearly gone on Nov 23, 2026). */
export const DEFAULT_AI_MODE: AiMode = "saver";

const MODE_ID = "ai-model";
export const AI_STATUS_ID = "anthropic";
/** While paused, automatic AI work tries again at most this often, so it resumes on its own once credit is added. */
export const BACKGROUND_RETRY_MS = 6 * 3600_000;

const isMode = (v: unknown): v is AiMode => v === "saver" || v === "full";

let modeCache: { mode: AiMode; at: number } | null = null;

export async function aiMode(db: PrismaClient = prisma): Promise<AiMode> {
  if (modeCache && Date.now() - modeCache.at < 30_000) return modeCache.mode;
  const row = await db.integrationStatus.findUnique({ where: { id: MODE_ID } }).catch(() => null);
  const mode = isMode(row?.status) ? row.status : DEFAULT_AI_MODE;
  modeCache = { mode, at: Date.now() };
  return mode;
}

export const aiModel = async (db: PrismaClient = prisma) => AI_MODELS[await aiMode(db)];

export async function setAiMode(mode: AiMode, db: PrismaClient = prisma) {
  await db.integrationStatus.upsert({ where: { id: MODE_ID }, create: { id: MODE_ID, name: "AI model", status: mode, detail: AI_MODELS[mode] }, update: { status: mode, detail: AI_MODELS[mode], checkedAt: new Date() } });
  modeCache = { mode, at: Date.now() };
}

const isHaiku = (model: string) => model.startsWith("claude-haiku");

/**
 * Model-dependent request fields. Opus gets the server-side refusal fallback; Haiku has none, so it gets neither the
 * beta flag nor the parameter.
 */
export function fallbackParams(model: string): { betas?: Anthropic.Beta.AnthropicBeta[]; fallbacks?: "default" } {
  return isHaiku(model) ? {} : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" };
}

/** Web search: the dynamic-filtering version needs Opus or Sonnet; Haiku uses the basic one. */
export function webSearchTool(model: string, maxUses: number): Anthropic.Beta.BetaToolUnion {
  return isHaiku(model)
    ? { type: "web_search_20250305", name: "web_search", max_uses: maxUses }
    : { type: "web_search_20260209", name: "web_search", max_uses: maxUses };
}

// ---------------------------------------------------------------------------------------------
// "AI paused": Anthropic refused for a reason she has to fix (credit or key). Nothing else in the app depends on it.

export type PauseReason = "credit" | "key";

export const PAUSE_MESSAGE: Record<PauseReason, string> = {
  credit: "AI is paused: your Anthropic credit balance ran out. Job feeds, Outlook sync, alerts and your board keep working. Add credit at console.anthropic.com (Billing), then try again.",
  key: "AI is paused: Anthropic didn't accept the API key (it may have expired). Job feeds, Outlook sync, alerts and your board keep working. Make a new key at console.anthropic.com, paste it into ANTHROPIC_API_KEY on ccc-web in Render, then try again.",
};

// Tolerates a stubbed SDK (tests replace the client class only).
const isA = <C extends abstract new (...a: never[]) => unknown>(e: unknown, C: C | undefined): e is InstanceType<C> => typeof C === "function" && e instanceof C;

/** Is this error one that only she can fix (credit or key), as opposed to a passing hiccup? */
export function pauseReason(e: unknown): PauseReason | null {
  if (e instanceof AiPausedError) return e.reason;
  if (isA(e, Anthropic.AuthenticationError)) return "key";
  if (!isA(e, Anthropic.APIError)) return null;
  const type = (e as { type?: string }).type ?? (e.error as { error?: { type?: string } } | undefined)?.error?.type;
  // Low balance comes back as a 400 "Your credit balance is too low..." or a 402 billing_error.
  if (e.status === 402 || type === "billing_error" || /credit balance|billing|purchase credits/i.test(e.message)) return "credit";
  return null;
}

export const pauseMessage = (e: unknown) => { const r = pauseReason(e); return r ? PAUSE_MESSAGE[r] : null; };

/** Thrown instead of calling Anthropic when automatic AI work is paused. */
export class AiPausedError extends Error {
  constructor(public reason: PauseReason) { super(PAUSE_MESSAGE[reason]); this.name = "AiPausedError"; }
}

export type AiPause = { reason: PauseReason; message: string; since: Date };

/** The current pause, if Anthropic's last answer was a credit or key refusal. */
export async function aiPause(db: PrismaClient = prisma): Promise<AiPause | null> {
  const row = await db.integrationStatus.findUnique({ where: { id: AI_STATUS_ID } }).catch(() => null);
  if (row?.status !== "paused") return null;
  const reason: PauseReason = row.detail === PAUSE_MESSAGE.key ? "key" : "credit";
  return { reason, message: PAUSE_MESSAGE[reason], since: row.checkedAt };
}

async function markPaused(reason: PauseReason, db: PrismaClient) {
  const data = { name: "Anthropic (AI)", status: "paused", detail: PAUSE_MESSAGE[reason], checkedAt: new Date() };
  await db.integrationStatus.upsert({ where: { id: AI_STATUS_ID }, create: { id: AI_STATUS_ID, ...data }, update: data }).catch(() => null);
}

// One small write per AI call (each call costs far more), so a pause set by a cron job clears on her next success.
async function markWorking(db: PrismaClient) {
  const data = { name: "Anthropic (AI)", status: "connected", detail: "Last call succeeded", checkedAt: new Date() };
  await db.integrationStatus.upsert({ where: { id: AI_STATUS_ID }, create: { id: AI_STATUS_ID, ...data }, update: data }).catch(() => null);
}

/**
 * Runs one Anthropic call and records the outcome: a credit or key refusal pauses AI (Settings shows why), a success
 * clears the pause. The original error is rethrown so each feature can explain it.
 */
export async function withAi<T>(fn: () => Promise<T>, db: PrismaClient = prisma): Promise<T> {
  try {
    const out = await fn();
    await markWorking(db);
    return out;
  } catch (e) {
    const r = pauseReason(e);
    if (r && !(e instanceof AiPausedError)) await markPaused(r, db);
    throw e;
  }
}

/**
 * May automatic AI work (briefing fit notes, research of a newly added company) run now? Not while paused, except
 * one try every few hours so it picks up again by itself once credit is added. Her own clicks always try.
 */
export async function backgroundAiAllowed(db: PrismaClient = prisma, now = Date.now()) {
  return !!process.env.ANTHROPIC_API_KEY && !(await backgroundPaused(db, now));
}

/** Paused, and the last try was recent: automatic AI work waits (cron jobs without the key check this too). */
export async function backgroundPaused(db: PrismaClient = prisma, now = Date.now()) {
  const p = await aiPause(db);
  return !!p && now - p.since.getTime() < BACKGROUND_RETRY_MS;
}
