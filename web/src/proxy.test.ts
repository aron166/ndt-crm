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
    "/api/suppressions",
    "/api/content",
    "/api/content/queue",
    "/api/content/live",
    "/api/content/12/claim",
    "/api/content/12/versions",
    "/api/calls/result",
    "/api/calls/pending",
    "/api/companies/42",
    "/api/persons/7",
    "/api/deals",
    "/api/deals/9",
    "/api/leads/queue",
    "/api/leads/12/slots",
    "/api/bookings",
    "/api/outreach/targets",
    "/api/outreach/drafts",
    "/api/cron/automations",
    "/api/cron/reply-intake",
    "/api/cron/content-digest",
    "/api/cron/weekly-report",
    "/api/reports/weekly",
    "/api/assistant/callnote",
    "/api/health",
    "/api/campaigns",
    "/api/campaigns/budapest-indulas",
    "/api/campaigns/birdsview_q3/specify",
    "/api/campaigns/bp/members",
    "/api/campaigns/bp/pause",
    "/api/campaigns/bp/today",
    "/api/campaigns/bp/outcome",
    "/api/campaigns/bp/analytics",
    "/api/reports/campaigns",
    "/api/campaigns/bp/lead-audience", // item 4: an agent may dry-run a lead load
    "/api/outreach/unsubscribe", // signed link, recipients have no session
    "/api/webhooks/resend", // signed by Resend, no session
    "/api/specification-requests", // Vanda #192-1: the agent polls with an app key, no cookie
  ];
  for (const path of bypassed) {
    it(`bypasses the session gate: ${path}`, () => {
      expect(isServiceApiPath(path)).toBe(true);
    });
  }

  const sessionGated = [
    "/api/search/companies", // session-auth'd UI route, must NOT be bypassed
    "/api/campaigns/bp/email-drafts", // item 4: session only, an operator drafts
    "/api/search/persons",
    "/api/companies", // no handler, and a collection route would need its own review
    "/api/persons",
    "/api/companies/42/notes", // a future nested route must not inherit the bypass
    "/api/persons/7/enrichment",
    "/api/companies/abc",
    "/api/deals/9/stage", // only the item route is an app route
    "/api/deals/abc",
    "/api/bookings/12", // list only
    "/api/booking/slots", // the booking drawer's session route stays gated
    "/companies/42",
    "/leads",
    "/api/suppressions/anything", // exact match only
    "/api/content/12", // no item route for apps
    "/api/content/12/review", // an app must never reach a verdict route
    "/api/content/abc/claim",
    "/api/content/12/claim/x",
    "/api/content/queue/x",
    "/api/calls/pending/x", // no item route for apps
    "/content",
    "/api/campaigns/bp/approve", // only Áron's session launches
    "/api/campaigns/bp/stop",
    "/api/campaigns/bp/steps",
    "/api/campaigns/bp/members/x",
    "/api/campaigns/a.b",
    "/api/outreach/unsubscribe/x", // anchored
    "/api/outreach/drafts/1",
  ];
  for (const path of sessionGated) {
    it(`stays behind the session gate: ${path}`, () => {
      expect(isServiceApiPath(path)).toBe(false);
    });
  }
});
