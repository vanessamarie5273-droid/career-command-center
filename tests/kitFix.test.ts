import { describe, expect, it, vi, beforeEach } from "vitest";

const create = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({ default: class { beta = { messages: { create } }; } }));

const { suggestFix } = await import("@/lib/kit");
const input = { resumeText: "Account Executive at SAP.", job: { title: "AE", location: null, descriptionText: null, requiredQuals: null, preferredQuals: null }, company: { name: "Vanta", category: "Security", maturity: null, description: null, keyProducts: null, customers: null, buyerPersonas: null, risks: null, news: [] } };
const issue = { kind: "language" as const, text: "passionate", detail: "Banned opener language" };
const reply = (text: string) => create.mockResolvedValueOnce({ stop_reason: "end_turn", content: [{ type: "text", text }] });

describe("suggested fixes", () => {
  beforeEach(() => create.mockReset());

  it("returns the sentence to change and its rewrite", async () => {
    reply('Here you go: {"find": "I am passionate about security.", "replace": "I sell security to CFOs.", "why": "Says what she does."}');
    const fix = await suggestFix(input, "letter", "Dear team,\n\nI am passionate about security.", issue);
    expect(fix).toEqual({ find: "I am passionate about security.", replace: "I sell security to CFOs.", why: "Says what she does." });
    expect(create.mock.calls[0][0].messages[0].content).toContain("[language] passionate");
  });

  it("rejects a suggestion that does not match the current text", async () => {
    reply('{"find": "Something else.", "replace": "x", "why": "y"}');
    await expect(suggestFix(input, "letter", "I am passionate about security.", issue)).rejects.toThrow(/did not match/);
  });

  it("rejects a reply that is not JSON", async () => {
    reply("Sorry, no.");
    await expect(suggestFix(input, "letter", "I am passionate.", issue)).rejects.toThrow(/wrong shape/);
  });
});
