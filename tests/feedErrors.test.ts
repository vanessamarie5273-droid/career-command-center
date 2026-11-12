import { describe, expect, it } from "vitest";
import { fetchLever } from "@/lib/ingest/lever";
import { fetchWorkday } from "@/lib/ingest/workday";
import { getJson, retryDelay } from "@/lib/ingest/http";
import { classifyTitle } from "@/lib/roles";

const json = (b: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json", ...headers } });

describe("feeds that failed on the Nov 12 refresh", () => {
  it("reads a Lever board that moved to Lever's EU API (Mistral AI)", async () => {
    const seen: string[] = [];
    const f = async (url: string) => {
      seen.push(url);
      if (url.startsWith("https://api.lever.co/")) return new Response("not found", { status: 404 });
      return json([{ id: "e8f5", text: "Account Executive, Enterprise (USA)", hostedUrl: "https://jobs.lever.co/mistral/e8f5", categories: { location: "New York" } }]);
    };
    const r = await fetchLever("mistral", f);
    expect(seen[1]).toBe("https://api.eu.lever.co/v0/postings/mistral?mode=json");
    expect(r.postings).toHaveLength(1);
    expect(r.postings[0]).toMatchObject({ title: "Account Executive, Enterprise (USA)", applyUrl: "https://jobs.lever.co/mistral/e8f5" });
  });

  it("skips untitled Workday search entries instead of failing the whole board (Accenture, Intel)", async () => {
    const f = async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        if (body.limit === 1) return json({ total: 2000, jobPostings: [] });
        if (body.searchText !== "account executive" || body.offset > 0) return json({ total: 0, jobPostings: [] });
        return json({ total: 2, jobPostings: [{ externalPath: "/job/blank" }, { title: "Account Executive, Public Sector", externalPath: "/job/AE-1", locationsText: "Phoenix, AZ" }] });
      }
      return json({ jobPostingInfo: { jobReqId: "R1", location: "Phoenix, AZ", jobDescription: "<p>Sell.</p>", externalUrl: "https://acme.wd1.myworkdayjobs.com/External/job/AE-1" } });
    };
    const r = await fetchWorkday("acme|wd1|External", f);
    expect(r.postings.map((p) => p.title)).toEqual(["Account Executive, Public Sector"]);
    expect(r.total).toBe(2000);
    expect(() => classifyTitle(undefined as unknown as string)).not.toThrow();
  });

  it("waits out a rate limit and retries instead of marking the board failed (Workable 429)", async () => {
    let calls = 0;
    const f = async () => (++calls === 1 ? json({}, 429, { "Retry-After": "0.01" }) : json({ jobs: [] }));
    await expect(getJson(f, "https://apply.workable.com/api/v1/widget/accounts/nuvei?details=true")).resolves.toEqual({ jobs: [] });
    expect(calls).toBe(2);
    expect(retryDelay(json({}, 429, { "Retry-After": "120" }), 0)).toBe(30_000);
    expect(retryDelay(json({}, 429), 1)).toBe(10_000);
  });
});
