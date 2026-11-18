import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh }) }));
const A = vi.hoisted(() => ({
  approveCampaignAction: vi.fn(), setCampaignStatusAction: vi.fn(), updateCampaignAction: vi.fn(),
  exportCampaignCsvAction: vi.fn(), markExportedAction: vi.fn(),
}));
vi.mock("@/app/actions/campaign-hub", () => A);

import { LaunchPanel, launchBlockers, type LaunchData } from "@/app/(app)/campaigns/[slug]/LaunchPanel";
import { RoutePicker } from "@/app/(app)/campaigns/[slug]/RoutePicker";
import { RESEND_PROSPECT_REFUSAL } from "@/lib/campaigns/send-route";

beforeEach(() => vi.clearAllMocks());

const READY: LaunchData = {
  slug: "bp", status: "draft", dailyCap: 15, startsOn: "2026-11-26", endsOn: null, outboundAutomations: false, scheduledSending: false, approvedAt: null, previewHash: "a".repeat(64),
  steps: [{ position: 1, channel: "email", waitDays: 0, audienceRule: "all", contentItemId: 5 }],
  assets: [{ id: 5, title: "E-mail", status: "live", version: 3 }],
  members: { queued: 76 },
};
const MB_OFF = { on: false, user: null, dailyCap: null };

describe("send route in the launch tab", () => {
  it("launchBlockers refuses a prospect e-mail on Resend only", () => {
    expect(launchBlockers({ ...READY, route: "resend", prospectEmail: true })).toContain(RESEND_PROSPECT_REFUSAL);
    expect(launchBlockers({ ...READY, route: "mailbox", prospectEmail: true })).not.toContain(RESEND_PROSPECT_REFUSAL);
    expect(launchBlockers({ ...READY, route: "resend", prospectEmail: false })).not.toContain(RESEND_PROSPECT_REFUSAL);
  });
  it("the approve button is disabled and the refusal shown", () => {
    render(<LaunchPanel d={{ ...READY, route: "resend", prospectEmail: true }} isAron />);
    expect((screen.getByRole("button", { name: "Jóváhagyás és indítás" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(RESEND_PROSPECT_REFUSAL)).toBeTruthy();
  });
  it("the confirm sentence names the route", () => {
    render(<LaunchPanel d={{ ...READY, route: "mailbox" }} isAron />);
    expect(screen.getByText(/küldési út: Postafiók \(Google Workspace\)\. Bármely módosítás/)).toBeTruthy();
  });
  it("RoutePicker saves the picked route", async () => {
    A.updateCampaignAction.mockResolvedValue({ ok: true });
    render(<RoutePicker slug="bp" route="resend" prospectEmail={false} mailbox={MB_OFF} status="draft" />);
    await userEvent.selectOptions(screen.getByLabelText("Küldési út"), "export");
    expect(A.updateCampaignAction).toHaveBeenCalledWith("bp", { send_route: "export" });
  });
  it("mailbox off names the missing settings; on shows user and cap, no password", () => {
    const { unmount } = render(<RoutePicker slug="bp" route="mailbox" prospectEmail mailbox={MB_OFF} status="draft" />);
    expect(screen.getByText(/CAMPAIGN_SMTP_HOST/)).toBeTruthy();
    unmount();
    const { container } = render(<RoutePicker slug="bp" route="mailbox" prospectEmail mailbox={{ on: true, user: "ivo@example.hu", dailyCap: 30 }} status="draft" />);
    expect(container.textContent).toMatch(/ivo@example\.hu postafiókból mennek, napi legfeljebb 30/);
    expect(container.textContent).not.toMatch(/pass/i);
  });
});
