import { describe, expect, it, vi, beforeEach } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import type { Company } from "@prisma/client";

vi.mock("@/lib/db", async () => ({ prisma: (await import("./setup-db")).testDb() }));
vi.mock("@/lib/auth", async (orig) => ({ ...(await orig<typeof import("@/lib/auth")>()), requireUser: async () => ({ sub: "u1", role: "ADMIN" }) }));

const { prisma } = await import("@/lib/db");
const ai = await import("@/lib/ai");
const { route } = await import("@/lib/api");
const { runResearch } = await import("@/lib/research");

const lowCredit = () => new Anthropic.BadRequestError(400, { type: "error", error: { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits." } },
  "400 Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.", new Headers());
const badKey = () => new Anthropic.AuthenticationError(401, { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }, "401 invalid x-api-key", new Headers());
const overloaded = () => new Anthropic.InternalServerError(529, { type: "error", error: { type: "overloaded_error", message: "Overloaded" } }, "529 Overloaded", new Headers());

beforeEach(async () => {
  await prisma.integrationStatus.deleteMany({ where: { id: { in: [ai.AI_STATUS_ID, "ai-model"] } } });
  await ai.setAiMode("saver");
  process.env.ANTHROPIC_API_KEY = "test-key";
});

describe("which model the app uses", () => {
  it("starts on the credit saver and switches back to Opus from Settings", async () => {
    await prisma.integrationStatus.deleteMany({ where: { id: "ai-model" } });
    await ai.setAiMode("saver");
    expect(await ai.aiModel()).toBe("claude-haiku-5-5");
    await ai.setAiMode("full");
    expect(await ai.aiModel()).toBe("claude-opus-5-5");
  });

  it("sends Haiku no refusal fallback and the basic web search; Opus keeps both", () => {
    expect(ai.fallbackParams("claude-haiku-5-5")).toEqual({});
    expect(ai.fallbackParams("claude-opus-5-5")).toEqual({ betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" });
    expect(ai.webSearchTool("claude-haiku-5-5", 10).type).toBe("web_search_20250305");
    expect(ai.webSearchTool("claude-opus-5-5", 10).type).toBe("web_search_20260209");
  });

  it("research on the saver sends Haiku's request shape", async () => {
    const create = vi.fn(async (p: Anthropic.Beta.MessageCreateParamsNonStreaming) => ({ content: [{ type: "tool_use", id: "t1", name: "save_research", input: {} }], stop_reason: "tool_use", params: p }) as unknown as Anthropic.Beta.BetaMessage);
    await runResearch({ id: "c1", name: "Acme" } as Company, { create }).catch(() => null); // the empty save fails validation; only the request matters
    const sent = create.mock.calls[0][0];
    expect(sent.model).toBe("claude-haiku-5-5");
    expect(sent).not.toHaveProperty("fallbacks");
    expect(sent).not.toHaveProperty("betas");
    expect((sent.tools as { type?: string }[])[0].type).toBe("web_search_20250305");
  });
});

describe("AI paused", () => {
  it("recognizes a low balance and a rejected key, but not a passing outage", () => {
    expect(ai.pauseReason(lowCredit())).toBe("credit");
    expect(ai.pauseReason(new Anthropic.APIError(402, { type: "error", error: { type: "billing_error", message: "x" } }, "402 x", new Headers()))).toBe("credit");
    expect(ai.pauseReason(badKey())).toBe("key");
    expect(ai.pauseReason(overloaded())).toBeNull();
    expect(ai.pauseReason(new Error("boom"))).toBeNull();
  });

  it("a credit refusal pauses AI, and the next success clears it", async () => {
    await expect(ai.withAi(async () => { throw lowCredit(); })).rejects.toThrow(/credit balance/);
    const p = await ai.aiPause();
    expect(p?.reason).toBe("credit");
    expect(p?.message).toMatch(/Job feeds, Outlook sync, alerts and your board keep working/);
    expect(await ai.withAi(async () => "ok")).toBe("ok");
    expect(await ai.aiPause()).toBeNull();
  });

  it("an outage does not pause AI", async () => {
    await expect(ai.withAi(async () => { throw overloaded(); })).rejects.toThrow();
    expect(await ai.aiPause()).toBeNull();
  });

  it("automatic AI work waits while paused and tries again after 6 hours", async () => {
    expect(await ai.backgroundAiAllowed()).toBe(true);
    await ai.withAi(async () => { throw badKey(); }).catch(() => null);
    expect(await ai.backgroundAiAllowed()).toBe(false);
    expect(await ai.backgroundPaused()).toBe(true);
    expect(await ai.backgroundAiAllowed(prisma, Date.now() + ai.BACKGROUND_RETRY_MS + 1000)).toBe(true);
  });

  it("a feature that hits a low balance answers with the plain-language pause message", async () => {
    const handler = route("EDITOR", async () => ai.withAi(async () => { throw lowCredit(); }));
    const res = await handler(new Request("http://x/api/kits", { method: "POST" }), {});
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.aiPaused).toBe(true);
    expect(body.error).toMatch(/^AI is paused: your Anthropic credit balance ran out/);
  });
});
