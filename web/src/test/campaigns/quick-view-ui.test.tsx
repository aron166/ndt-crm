import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
const A = vi.hoisted(() => ({ memberQuickViewAction: vi.fn() }));
vi.mock("@/app/actions/campaign-hub", () => A);

import { MemberList } from "@/app/(app)/campaigns/[slug]/MemberList";
import { renderEmail } from "@/lib/campaigns/email-preview";
import type { QuickView } from "@/lib/campaigns/preview";

const VALUES = { company: "<b>Minta</b> Kft.", contactName: null, city: "Győr", segment: "D" as const, senderName: "Balogh Áron", senderPhone: null, whyNow: null, tripDate: null, tripCity: null };
const VIEW: QuickView = {
  member: { id: 1, state: "needs_email", stepPosition: 1, stepChannel: "email", stepCount: 2, tier: "B", lane: "MEP and drilling", why: null, city: "Győr",
    rawSegment: "drillers", segment: "D", segmentLabel: "gyémántfúrók", source: null, importBatch: "bp-1", attempts: 0, lastOutcome: null, lastTouchedAt: null },
  company: { id: 40, name: "<b>Minta</b> Kft.", website: null, createdByLoad: false },
  contact: { name: null, role: null, email: null, phone: null, kind: null, origin: null },
  history: { leadId: null, leads: [], deals: [], campaigns: [], events: [], interactions: 0, lastInteraction: null, controlLabor: { accountType: null, customerValue: null, frequency: null, methods: [] } },
  emails: [{ position: 1, itemId: 60, title: "T", status: "in_review", version: 1, approvedBy: [], via: "variant",
    rendered: renderEmail({ subject: "Mérés: {{company}}", body: "{{greeting}}\n{{sender_phone}}" }, VALUES) }],
  problems: ["nincs e-mail cím", "1. lépés: kitöltetlen mező: feladó telefonszáma"],
  sender: { name: "Balogh Áron", phone: null, from: null, replyTo: null, footer: null },
};
const ROWS = [{ id: 1, company: "<b>Minta</b> Kft.", city: "Győr", tier: "B", lane: "MEP and drilling", segment: "D" as const, state: "needs_email", stepPosition: 1 }];

beforeEach(() => { vi.clearAllMocks(); A.memberQuickViewAction.mockResolvedValue({ ok: true, view: VIEW }); });

describe("prospect quick view", () => {
  it("opens from a row by keyboard, as a labelled dialog, and shows the gaps and markers", async () => {
    render(<MemberList slug="bp" rows={ROWS} />);
    const row = screen.getByRole("button", { name: "<b>Minta</b> Kft." });
    row.focus();
    await userEvent.keyboard("{Enter}");
    expect(A.memberQuickViewAction).toHaveBeenCalledWith("bp", 1);
    const dlg = await screen.findByRole("dialog", { name: "<b>Minta</b> Kft." });
    // Markup in a company name is text, never HTML.
    expect(dlg.querySelector("b")).toBeNull();
    expect(within(dlg).getByText("Nincs e-mail cím.")).toBeTruthy();
    expect(within(dlg).getByText("Az ok nincs rögzítve ennél a tagnál.")).toBeTruthy();
    expect(within(dlg).getByLabelText("kitöltetlen mező: feladó telefonszáma")).toBeTruthy();
    expect(within(dlg).getByText(/Jó napot kívánok!/)).toBeTruthy();
    expect(within(dlg).getByText(/Javaslat: amíg nem élő/)).toBeTruthy();
    expect(within(dlg).getByRole("link", { name: "Cég megnyitása" }).getAttribute("href")).toBe("/companies/40");
    expect(within(dlg).getByRole("button", { name: "Bezárás" })).toBeTruthy();
  });
  it("says exactly that a step has no asset and links to where to attach one", async () => {
    A.memberQuickViewAction.mockResolvedValue({ ok: true, view: { ...VIEW, emails: [{ ...VIEW.emails[0], itemId: null, rendered: null, status: null }] } });
    render(<MemberList slug="bp" rows={ROWS} openId={1} />);
    const dlg = await screen.findByRole("dialog");
    expect(within(dlg).getByText(/ehhez a taghoz nincs e-mail anyag/)).toBeTruthy();
    expect(within(dlg).getByRole("link", { name: "Anyag csatolása a lépésekhez" }).getAttribute("href")).toBe("/campaigns/bp?tab=overview");
  });
});
