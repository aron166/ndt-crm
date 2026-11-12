import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
const createCampaignAction = vi.fn();
const requestSpecificationAction = vi.fn();
vi.mock("@/app/actions/campaign-hub", () => ({
  createCampaignAction: (...a: unknown[]) => createCampaignAction(...a),
  requestSpecificationAction: (...a: unknown[]) => requestSpecificationAction(...a),
  updateCampaignAction: vi.fn(), adoptProposedStepsAction: vi.fn(), saveStepsAction: vi.fn(),
}));

import { CreateCampaignForm } from "@/app/(app)/campaigns/new/CreateCampaignForm";
import { RunningStrip } from "@/components/campaigns/RunningStrip";
import { SpecifyPanel } from "@/app/(app)/campaigns/[slug]/SpecifyPanel";

beforeEach(() => vi.clearAllMocks());

describe("Új kampány", () => {
  it("starts as a sequence: e-mail first, then the call", () => {
    render(<CreateCampaignForm users={[]} />);
    expect((screen.getByRole("radio", { name: /Sorozat/ }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("1. lépés csatorna") as HTMLSelectElement).value).toBe("email");
    expect((screen.getByLabelText("2. lépés csatorna") as HTMLSelectElement).value).toBe("call");
  });
  it("a cold-call campaign offers calls only", async () => {
    render(<CreateCampaignForm users={[]} />);
    await userEvent.click(screen.getByRole("radio", { name: /Hidegtelefon/ }));
    const sel = screen.getByLabelText("1. lépés csatorna");
    expect(within(sel).getAllByRole("option").map((o) => o.getAttribute("value"))).toEqual(["call"]);
    expect(screen.queryByLabelText("2. lépés csatorna")).toBeNull();
  });
  it("ad is content only: no step editor, honest note", async () => {
    render(<CreateCampaignForm users={[]} />);
    await userEvent.click(screen.getByRole("radio", { name: /Hirdetés/ }));
    expect(screen.queryByLabelText("1. lépés csatorna")).toBeNull();
    expect(screen.getByText(/csak tartalom/)).toBeTruthy();
  });
  it("saves a draft with the steps and opens the campaign", async () => {
    createCampaignAction.mockResolvedValue({ ok: true, slug: "budapest" });
    render(<CreateCampaignForm users={[{ id: 3, name: "Péter" }]} />);
    await userEvent.type(screen.getByLabelText("Név"), "Budapest");
    await userEvent.click(screen.getByRole("button", { name: "Piszkozat mentése" }));
    expect(createCampaignAction).toHaveBeenCalledWith(expect.objectContaining({ name: "Budapest", kind: "sequence", steps: [expect.objectContaining({ channel: "email" }), expect.objectContaining({ channel: "call", wait_days: 3 })] }));
    expect(push).toHaveBeenCalledWith("/campaigns/budapest");
  });
  it("shows the server's refusal", async () => {
    createCampaignAction.mockResolvedValue({ error: "Sorozatban az e-mail lépés az első" });
    render(<CreateCampaignForm users={[]} />);
    await userEvent.type(screen.getByLabelText("Név"), "X");
    await userEvent.click(screen.getByRole("button", { name: "Piszkozat mentése" }));
    expect(screen.getByRole("alert").textContent).toMatch(/e-mail lépés az első/);
    expect(push).not.toHaveBeenCalled();
  });
});

describe("Futó kampányok", () => {
  const stats = { audience: 76, needsContact: 0, needsEmail: 4, touched: 38, replied: 6, promoted: 5, booked: 2, declined: 1, unreachable: 0,
    byStep: [{ step: 1, touched: 30, replied: 6, promoted: 1 }, { step: 2, touched: 12, replied: 0, promoted: 4 }],
    byDay: [{ day: "2026-11-16", touches: 20, replies: 3, promoted: 2 }] };
  it("shows totals, then by step and by day", async () => {
    render(<RunningStrip rows={[{ campaign: { slug: "bp", name: "Budapest indulás", kind: "sequence" }, stats }]} />);
    expect(screen.getByText("76")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Lépés szerint" }));
    expect(screen.getByText("2. lépés")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Nap szerint" }));
    expect(screen.getByText("2026-11-16")).toBeTruthy();
  });
  it("Bevétel view: zero deals says so; a won deal shows its value per segment", async () => {
    const cell = { leads: 0, converted: 0, convertedValue: 0, won: 0, wonValue: 0, otherCurrency: 0 };
    const none = { total: cell, bySegment: [], byChannel: [], bySource: [], byCampaign: [] };
    const row = { campaign: { slug: "bp", name: "Budapest indulás", kind: "sequence" }, stats };
    const { unmount } = render(<RunningStrip rows={[{ ...row, revenue: none }]} />);
    await userEvent.click(screen.getByRole("button", { name: "Bevétel" }));
    expect(screen.getByText("Még nincs deallé vált lead ebben az időszakban.")).toBeTruthy();
    unmount();
    const won = { ...cell, leads: 3, converted: 1, convertedValue: 500000, won: 1, wonValue: 500000 };
    const { unmount: unmount2 } = render(<RunningStrip rows={[{ ...row, revenue: { ...none, total: won, bySegment: [{ key: "A", ...won }] } }]} />);
    await userEvent.click(screen.getByRole("button", { name: "Bevétel" }));
    expect(screen.getByText(/^Szegmens: A/)).toBeTruthy();
    expect(screen.getAllByText(/500\s?000/).length).toBeGreaterThan(0);
    unmount2();
    render(<RunningStrip rows={[{ ...row, revenue: { ...none, total: { ...won, otherCurrency: 2 }, byChannel: [{ key: "landing", ...won }] } }]} />);
    await userEvent.click(screen.getByRole("button", { name: "Bevétel" }));
    expect(screen.getByText(/2 deal más pénznemben/)).toBeTruthy();
  });
  it("says so when nothing runs", () => {
    render(<RunningStrip rows={[]} />);
    expect(screen.getByText("Nincs futó kampány.")).toBeTruthy();
  });
});

describe("Specifikáció AI-val", () => {
  it("shows each proposed asset's state in the approval pipeline and the agent endpoint", () => {
    render(<SpecifyPanel slug="bp" editable canAdoptSteps proposal={{ brief: { offer: "x" }, steps: [{ channel: "email" }], assets: [{ item_id: 5, step_position: 1 }, { item_id: 6, step_position: 2 }], proposed_by: "corvid" }}
      assets={[{ id: 5, title: "E-mail 1", status: "in_review", version: 1 }, { id: 6, title: "Szkript", status: "live", version: 2 }]} />);
    expect(screen.getByText(/Anyagok: felülvizsgálatra/)).toBeTruthy();
    expect(screen.getByText(/Anyagok: jóváhagyva/)).toBeTruthy();
    expect(screen.getByText(/POST \/api\/campaigns\/bp\/specify/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Lépések átvétele" })).toBeTruthy();
  });
  it("steps are adoptable only on a draft with per-member steps (not running, not content only)", () => {
    render(<SpecifyPanel slug="bp" editable proposal={{ brief: { offer: "x" }, steps: [{ channel: "email" }] }} assets={[]} />);
    expect(screen.queryByRole("button", { name: "Lépések átvétele" })).toBeNull();
    expect(screen.getByRole("button", { name: "Brief átvétele" })).toBeTruthy();
  });
  it("with no proposal there is nothing to adopt", () => {
    render(<SpecifyPanel slug="bp" editable proposal={null} assets={[]} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("asking an agent from the panel (item 6)", () => {
  it("prefills what is missing and records a request; the CRM calls no model", async () => {
    requestSpecificationAction.mockResolvedValue({ ok: true, created: true });
    render(<SpecifyPanel slug="bp" editable proposal={null} assets={[]} canRequest missing={["cél, ajánlat", "2. lépés anyaga (Hívás)"]} />);
    await userEvent.click(screen.getByRole("button", { name: "Ügynök kérése" }));
    expect((screen.getByLabelText("Mit kérsz az ügynöktől?") as HTMLTextAreaElement).value).toBe("Hiányzik: cél, ajánlat, 2. lépés anyaga (Hívás).");
    await userEvent.click(screen.getByRole("button", { name: "Kérés küldése" }));
    expect(requestSpecificationAction).toHaveBeenCalledWith("bp", "Hiányzik: cél, ajánlat, 2. lépés anyaga (Hívás).");
    expect(screen.getByRole("status").textContent).toMatch(/Kérés rögzítve/);
  });
  it("no request on a running campaign", () => {
    render(<SpecifyPanel slug="bp" editable proposal={null} assets={[]} canRequest={false} />);
    expect(screen.queryByRole("button", { name: "Ügynök kérése" })).toBeNull();
  });
});
