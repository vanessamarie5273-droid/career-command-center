import { describe, expect, it } from "vitest";
import { selectWithinCap } from "../src/lib/companyCap";

const job = (id: string, companyId: string, title: string, score: number) => ({ id, companyId, title, score, overrideScore: null, firstSeenAt: new Date() });

describe("3 roles per company", () => {
  const rows = [
    job("a1", "A", "Strategic Account Executive", 90), job("a2", "A", "Enterprise Account Executive", 85),
    job("a3", "A", "Account Director", 80), job("a4", "A", "Regional Sales Director", 75), job("a5", "A", "Head of Sales Development", 70),
    job("b1", "B", "Account Director", 60),
  ];
  it("keeps the top 3 roles at each company and counts the rest as held back", () => {
    const r = selectWithinCap(rows, new Map(), new Set());
    expect(r.ids.sort()).toEqual(["a1", "a2", "a3", "b1"]);
    expect(r.hidden).toBe(2);
  });
  it("counts roles already applied to against the limit, and keeps those roles visible", () => {
    const r = selectWithinCap(rows, new Map([["A", 2]]), new Set(["a4"]));
    expect(r.ids.sort()).toEqual(["a1", "a4", "b1"]);
  });
  it("hides every new role once 3 applications are in at a company", () => {
    expect(selectWithinCap(rows, new Map([["A", 3]]), new Set()).ids).toEqual(["b1"]);
  });
  it("treats the same title in several cities as one role", () => {
    const multi = [job("x1", "X", "Account Director, West", 90), job("x2", "X", "Account Director - West (Remote)", 89), job("x3", "X", "Strategic AE", 80), job("x4", "X", "Account Executive", 70), job("x5", "X", "Sales Director", 60)];
    const r = selectWithinCap(multi, new Map(), new Set());
    expect(r.ids.sort()).toEqual(["x1", "x2", "x3", "x4"]);
  });
  it("uses your score override when ranking", () => {
    const r = selectWithinCap([...rows.slice(0, 4), { ...job("a5", "A", "Head of Sales Development", 10), overrideScore: 99 }], new Map(), new Set());
    expect(r.ids).toContain("a5");
    expect(r.ids).not.toContain("a3");
  });
});
