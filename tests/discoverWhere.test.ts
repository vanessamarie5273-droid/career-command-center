import { describe, expect, it } from "vitest";
import { jobWhere } from "@/lib/jobFilters";

// Nov 28 redesign: Discover's single "Where" control stands for the older Remote and Phoenix-area checkboxes,
// so saved links that use either spelling keep working.
describe("Discover Where filter", () => {
  const parts = (p: Parameters<typeof jobWhere>[0]) => JSON.stringify(jobWhere(p));
  it("remote only matches the old remote checkbox", () => {
    expect(parts({ loc: "remote" })).toBe(parts({ remote: "1" }));
  });
  it("Phoenix area or remote matches the old Phoenix-area checkbox", () => {
    expect(parts({ loc: "phx" })).toBe(parts({ near: "phx" }));
    expect(parts({ loc: "phx" })).toContain("Scottsdale");
  });
  it("opening a role in the side panel does not change the list", () => {
    expect(parts({ job: "abc" })).toBe(parts({}));
  });
});
