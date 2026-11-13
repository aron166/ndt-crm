import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
const A = vi.hoisted(() => ({
  approveCampaignAction: vi.fn(), setCampaignStatusAction: vi.fn(), updateCampaignAction: vi.fn(),
  loadMembersAction: vi.fn(), undoBatchAction: vi.fn(), adoptProposedStepsAction: vi.fn(), saveStepsAction: vi.fn(),
}));
vi.mock("@/app/actions/campaign-hub", () => A);

import { LaunchPanel, launchBlockers, type LaunchData } from "@/app/(app)/campaigns/[slug]/LaunchPanel";
import { MemberLoad, loadCounts } from "@/app/(app)/campaigns/[slug]/MemberLoad";

beforeEach(() => vi.clearAllMocks());

const READY: LaunchData = {
  slug: "bp", status: "draft", dailyCap: 15, startsOn: "2026-11-26", endsOn: null, outboundAutomations: false, scheduledSending: false, approvedAt: null, previewHash: "a".repeat(64),
  steps: [
    { position: 1, channel: "email", waitDays: 0, audienceRule: "all", contentItemId: 5 },
    { position: 2, channel: "call", waitDays: 3, audienceRule: "no_reply", contentItemId: 6 },
  ],
  assets: [{ id: 5, title: "E-mail", status: "live", version: 3 }, { id: 6, title: "Szkript", status: "live", version: 1 }],
  members: { queued: 76, needs_email: 4 },
};

describe("Indítás", () => {
  it("lists what blocks a launch", () => {
    expect(launchBlockers(READY)).toEqual([]);
    expect(launchBlockers({ ...READY, assets: [{ ...READY.assets[0], status: "in_review" }, READY.assets[1]] })).toEqual(["1. lépés: az anyag még nincs jóváhagyva"]);
    expect(launchBlockers({ ...READY, members: {} })).toContain("Nincs elérhető tag");
  });
  it("only Áron can press approve and launch", () => {
    render(<LaunchPanel d={READY} isAron={false} />);
    expect((screen.getByRole("button", { name: "Jóváhagyás és indítás" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("csak Áron")).toBeTruthy();
  });
  it("Áron launches a ready campaign; the summary names what he approves", async () => {
    A.approveCampaignAction.mockResolvedValue({ ok: true });
    render(<LaunchPanel d={READY} isAron />);
    expect(screen.getByText(/Ezt hagyod jóvá: 80 cég \(76 elérhető\), 2 lépés, napi 15, E-mail v3, Szkript v1/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Jóváhagyás és indítás" }));
    expect(A.approveCampaignAction).toHaveBeenCalledWith("bp", "a".repeat(64));
  });
  it("an unsaved cap change blocks the launch until it is saved (a save resets to draft)", async () => {
    render(<LaunchPanel d={READY} isAron />);
    const cap = screen.getByLabelText("Napi keret (hívás)");
    await userEvent.clear(cap);
    await userEvent.type(cap, "20");
    expect((cap as HTMLInputElement).value).toBe("20");
    expect((screen.getByRole("button", { name: "Jóváhagyás és indítás" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Keret és időszak mentése" })).toBeTruthy();
  });
  it("a thrown action re-enables the launch button with an error", async () => {
    A.approveCampaignAction.mockRejectedValue(new Error("offline"));
    render(<LaunchPanel d={READY} isAron />);
    await userEvent.click(screen.getByRole("button", { name: "Jóváhagyás és indítás" }));
    expect(screen.getByRole("status").textContent).toMatch(/Hálózati hiba/);
    expect((screen.getByRole("button", { name: "Jóváhagyás és indítás" }) as HTMLButtonElement).disabled).toBe(false);
  });
  it("a running campaign shows pause and stop, no launch", () => {
    render(<LaunchPanel d={{ ...READY, status: "running" }} isAron />);
    expect(screen.queryByRole("button", { name: "Jóváhagyás és indítás" })).toBeNull();
    expect(screen.getByRole("button", { name: "Szüneteltetés" })).toBeTruthy();
  });
});

const SUMMARY = { total: 10, add: 6, refresh: 1, skip: 3, newCompanies: 2, newPersons: 2, needsContact: 0, needsEmail: 2, skipped: { open_lead: 1, suppressed: 1, already_member: 1, duplicate_in_payload: 0, unknown_company_id: 0 } };

describe("Tagok betöltése", () => {
  it("counts new, already a lead, suppressed, duplicate and no e-mail", () => {
    expect(loadCounts(SUMMARY).map((c) => c.v)).toEqual([6, 1, 1, 1, 1, 0, 2, 0]);
  });
  async function dryRun(canOperate: boolean) {
    A.loadMembersAction.mockResolvedValue({ ok: true, dryRun: true, summary: SUMMARY, added: 0 });
    render(<MemberLoad slug="bp" status="draft" canOperate={canOperate} closed={false} batches={[]} />);
    const file = new File([JSON.stringify([{ company_name: "A" }])], "lista.json", { type: "application/json" });
    await userEvent.upload(screen.getByLabelText("Fájl"), file);
    await userEvent.click(screen.getByRole("button", { name: "Próba" }));
  }
  it("a dry run writes nothing and shows the counts; apply needs an operator", async () => {
    await dryRun(false);
    expect(A.loadMembersAction).toHaveBeenCalledWith("bp", expect.objectContaining({ dryRun: true }));
    expect(screen.getByText("Nincs e-mail (e-mailre vár)")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Betöltés (7)" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("on a running campaign the dry run warns that applying sends it back to draft", async () => {
    A.loadMembersAction.mockResolvedValue({ ok: true, dryRun: true, summary: SUMMARY, added: 0 });
    render(<MemberLoad slug="bp" status="running" canOperate closed={false} batches={[]} />);
    await userEvent.upload(screen.getByLabelText("Fájl"), new File(["[{}]"], "l.json", { type: "application/json" }));
    await userEvent.click(screen.getByRole("button", { name: "Próba" }));
    expect(screen.getByText(/visszaáll piszkozatra/)).toBeTruthy();
  });
  it("an operator applies the same file and batch", async () => {
    await dryRun(true);
    A.loadMembersAction.mockResolvedValue({ ok: true, dryRun: false, summary: SUMMARY, added: 6 });
    await userEvent.click(screen.getByRole("button", { name: "Betöltés (7)" }));
    expect(A.loadMembersAction).toHaveBeenLastCalledWith("bp", expect.objectContaining({ dryRun: false }));
    expect(screen.getByRole("status").textContent).toMatch(/6 új tag/);
  });
  it("undo is offered only for a batch nobody touched, after its own dry run", async () => {
    A.undoBatchAction.mockResolvedValue({ ok: true, summary: { members: 3, remove: 3, keptTouched: 0, softDeleteCompanies: 1, softDeletePersons: 1 } });
    render(<MemberLoad slug="bp" status="draft" canOperate closed={false} batches={[
      { batch: "ui-1", members: 3, touched: 0, createdAt: null }, { batch: "ui-2", members: 5, touched: 2, createdAt: null },
    ]} />);
    expect(screen.getAllByRole("button", { name: "Visszavonás" })).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "Visszavonás" }));
    expect(A.undoBatchAction).toHaveBeenCalledWith("bp", "ui-1", true);
    await userEvent.click(screen.getByRole("button", { name: "Visszavonás megerősítése" }));
    expect(A.undoBatchAction).toHaveBeenLastCalledWith("bp", "ui-1", false);
  });
});
