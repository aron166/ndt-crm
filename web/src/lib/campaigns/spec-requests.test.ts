import { describe, it, expect } from "vitest";
import { SPEC_SET, specRequestTags, slugFromTags } from "./spec-requests";

describe("specification requests are tasks an agent can list (item 6)", () => {
  it("tags a task with the request set and the campaign slug, and reads the slug back", () => {
    expect(specRequestTags("budapest-indulas")).toEqual([SPEC_SET, "campaign:budapest-indulas"]);
    expect(slugFromTags(["x", SPEC_SET, "campaign:budapest-indulas"])).toBe("budapest-indulas");
    expect(slugFromTags(["campaign:bp"])).toBeNull(); // not a request without the set tag
  });
});
