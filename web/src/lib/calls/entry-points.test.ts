import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// C1 (2026-11-12): the 8 places a call is logged, and the writer each one reaches. The side
// effects of each writer are tested next to it (lib/leads/service.test.ts, lib/campaigns/
// service.test.ts, app/actions/outreach-recordcall.test.ts). This pins the wiring, so a new
// button cannot quietly start its own write path.
const src = (p: string) => readFileSync(join(__dirname, "..", "..", p), "utf8");

describe("every call entry point reaches the one call-outcome writer", () => {
  it.each([
    ["1 leads board card 'Hívás' (CallOutcomeModal)", "app/(app)/leads/CallOutcomeModal.tsx", /logLeadCall\b/],
    ["2 lead page OutcomePad and booking drawer", "app/(app)/leads/[id]/LeadDetailClient.tsx", /logLeadCall\(/],
    ["3 /drive", "app/drive/DriveScreen.tsx", /logLeadCall\(/],
    ["4 /calls cockpit", "app/(app)/calls/CallCockpit.tsx", /recordCall\(/],
    ["5 /calls campaign tab", "app/(app)/calls/CampaignCallView.tsx", /recordCampaignOutcomeAction\(/],
  ])("%s", (_n, file, call) => {
    expect(src(file)).toMatch(call);
  });

  it("8 POST /api/calls/result and the lead UI action use logLeadCallOutcome", () => {
    expect(src("app/api/calls/result/route.ts")).toMatch(/logLeadCallOutcome\(/);
    expect(src("app/actions/leads.ts")).toMatch(/logLeadCallOutcome\(/);
  });

  it("logLeadCallOutcome advances campaign members; recordCall and the hub go through recordOutcome", () => {
    expect(src("lib/leads/service.ts")).toMatch(/advanceMembersForCall\(/);
    expect(src("app/actions/outreach.ts")).toMatch(/recordOutcome\(/);
    expect(src("app/actions/campaign-hub.ts")).toMatch(/svc\.recordOutcome\(/);
  });

  it("6 and 7 'Naplózás' / task completion: a free log with no outcome key, by rule NOT an outcome (no stage, task or member change)", () => {
    const s = src("app/actions/interactions.ts");
    for (const w of ["logLeadCallOutcome", "recordOutcome", "advanceMembersForCall", "completeOpenLeadCallTasks"]) expect(s).not.toContain(w);
    expect(src("components/LogInteractionModal.tsx")).toMatch(/logInteraction/);
    expect(src("components/useTaskCompletion.tsx")).toMatch(/LogInteractionModal/);
  });
});
