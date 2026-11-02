import { describe, expect, it } from "vitest";
import { fetchGreenhouse } from "@/lib/ingest/greenhouse";
import { greenhouseBoard, mockFetch } from "./fixtures/boards";

describe("Greenhouse board", () => {
  it("lists the board without descriptions and fetches them only for U.S. sales roles", async () => {
    const urls: string[] = [];
    const inner = mockFetch({ "boards-api.greenhouse.io/v1/boards/testco": greenhouseBoard([
      { id: 1, title: "Enterprise Account Executive", location: "Remote - US" },
      { id: 2, title: "Senior Software Engineer", location: "Remote - US" },
      { id: 3, title: "Enterprise Account Executive", location: "London, UK" },
    ]) });
    const r = await fetchGreenhouse("testco", async (url) => { urls.push(url); return inner(url); });
    expect(urls).toEqual(["https://boards-api.greenhouse.io/v1/boards/testco/jobs", "https://boards-api.greenhouse.io/v1/boards/testco/jobs/1"]);
    expect(r.postings).toHaveLength(3);
    expect(r.postings[0]).toMatchObject({ externalId: "testco:1", department: "Sales" });
    expect(r.postings[0].descriptionHtml).toContain("OTE range");
    expect(r.postings[1].descriptionHtml).toBeNull();
    expect(r.total).toBe(43);
  });
});
