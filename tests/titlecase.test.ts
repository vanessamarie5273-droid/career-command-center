import { describe, expect, it } from "vitest";
import { titleCase } from "@/lib/format";

describe("titleCase", () => {
  it("capitalizes headings without touching acronyms or short joining words", () => {
    expect(titleCase("Your next moves")).toBe("Your Next Moves");
    expect(titleCase("Open roles by tier")).toBe("Open Roles by Tier");
    expect(titleCase("Follow-ups due")).toBe("Follow-Ups Due");
    expect(titleCase("Ready to apply")).toBe("Ready to Apply");
    expect(titleCase("AI assessment")).toBe("AI Assessment");
    expect(titleCase("LinkedIn: what this app can and cannot do")).toBe("LinkedIn: What This App Can and Cannot Do");
    expect(titleCase("Outlook (your job inbox)")).toBe("Outlook (Your Job Inbox)");
    expect(titleCase("Tier 1 open")).toBe("Tier 1 Open");
  });
});
