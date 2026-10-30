import { describe, expect, it } from "vitest";
import { newestFirst } from "@/lib/applications";

describe("My Applications order", () => {
  it("puts the most recent at the top and the oldest at the bottom, using the saved date when not applied", () => {
    const d = (s: string) => new Date(s);
    const apps = [
      { id: "old", appliedAt: d("2026-09-01"), createdAt: d("2026-08-30") },
      { id: "saved", appliedAt: null, createdAt: d("2026-10-29") },
      { id: "mid", appliedAt: d("2026-10-15"), createdAt: d("2026-10-01") },
    ];
    expect(newestFirst(apps).map((a) => a.id)).toEqual(["saved", "mid", "old"]);
  });
});
