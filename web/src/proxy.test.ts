import { describe, it, expect } from "vitest";
import { isServiceApiPath } from "./proxy";

// A route that falls off this list is redirected to /login and becomes
// unreachable for its app-key caller — invisible to tsc, the tests and the
// preview build (that is exactly how #92 shipped broken). This table is the
// only thing that notices.
describe("isServiceApiPath", () => {
  const bypassed = [
    "/api/events",
    "/api/conversations",
    "/api/leads",
    "/api/leads/12",
    "/api/leads/12/interactions",
    "/api/content",
    "/api/calls/result",
    "/api/companies/42",
    "/api/persons/7",
    "/api/outreach/targets",
    "/api/outreach/drafts",
    "/api/cron/automations",
    "/api/health",
  ];
  for (const path of bypassed) {
    it(`bypasses the session gate: ${path}`, () => {
      expect(isServiceApiPath(path)).toBe(true);
    });
  }

  const sessionGated = [
    "/api/search/companies", // session-auth'd UI route, must NOT be bypassed
    "/api/search/persons",
    "/api/companies", // no handler, and a collection route would need its own review
    "/api/persons",
    "/api/companies/42/notes", // a future nested route must not inherit the bypass
    "/api/persons/7/enrichment",
    "/api/companies/abc",
    "/companies/42",
    "/leads",
  ];
  for (const path of sessionGated) {
    it(`stays behind the session gate: ${path}`, () => {
      expect(isServiceApiPath(path)).toBe(false);
    });
  }
});
