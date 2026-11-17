import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
const C = vi.hoisted(() => ({ setCampaignOutreach: vi.fn() }));
vi.mock("@/app/actions/campaigns", () => C);
const P = vi.hoisted(() => ({ saveSenderPhone: vi.fn() }));
vi.mock("@/app/actions/sender-profile", () => P);

import { SenderPicker } from "@/app/(app)/campaigns/[slug]/SenderPicker";
import { EmailCheck } from "@/app/(app)/campaigns/[slug]/EmailCheck";
import type { EmailCheck as Check } from "@/lib/campaigns/preview";

beforeEach(() => { vi.clearAllMocks(); P.saveSenderPhone.mockResolvedValue({ ok: true, phone: "+36 30 123 4567" }); C.setCampaignOutreach.mockResolvedValue({ success: true }); });

const SENDERS = [{ id: 5, name: "Balogh Áron" }, { id: 9, name: "Nagy Péter" }];

describe("SenderPicker in the hub", () => {
  it("no users: only the empty choice, no phone field", () => {
    render(<SenderPicker campaignId={2} senderUserId={null} senders={[]} phone={null} />);
    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(screen.queryByLabelText(/telefonszám/i)).toBeNull();
  });
  it("picking a sender saves it on the campaign", async () => {
    render(<SenderPicker campaignId={2} senderUserId={null} senders={SENDERS} phone={null} />);
    await userEvent.selectOptions(screen.getByLabelText("Feladó"), "9");
    expect(C.setCampaignOutreach).toHaveBeenCalledWith(2, { senderUserId: 9 });
  });
  it("with a sender: the phone is editable and saved for that sender", async () => {
    render(<SenderPicker campaignId={2} senderUserId={9} senders={SENDERS} phone={null} />);
    const input = screen.getByLabelText(/telefonszám/i);
    await userEvent.type(input, "06301234567");
    await userEvent.click(screen.getByRole("button", { name: /mentés/i }));
    expect(P.saveSenderPhone).toHaveBeenCalledWith({ userId: 9, phone: "06301234567" });
  });
  it("shows the server's refusal", async () => {
    P.saveSenderPhone.mockResolvedValue({ error: "Ehhez admin szerep kell" });
    render(<SenderPicker campaignId={2} senderUserId={9} senders={SENDERS} phone="+36 30 000 0000" />);
    expect(screen.getByLabelText(/telefonszám/i)).toHaveValue("+36 30 000 0000");
    await userEvent.click(screen.getByRole("button", { name: /mentés/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Ehhez admin szerep kell");
  });
});

describe("EmailCheck lists the sender gaps (AC5)", () => {
  const base: Check = { total: 1, complete: 0, unresolved: 1, noAddress: 0, noAsset: 0, notLive: 0, emailSteps: 1, rows: [],
    sender: { name: null, phone: null, from: "x@y.hu", replyTo: null, footer: "f" },
    senderGaps: ["Nincs feladó kiválasztva", "A feladónak nincs telefonszáma"] };
  it("shows each gap", () => {
    render(<EmailCheck slug="bp" c={base} campaignId={2} senderUserId={null} senders={[]} />);
    expect(screen.getByText("Nincs feladó kiválasztva")).toBeTruthy();
    expect(screen.getByText("A feladónak nincs telefonszáma")).toBeTruthy();
  });
  it("shows none when both are set", () => {
    render(<EmailCheck slug="bp" c={{ ...base, sender: { ...base.sender, name: "N P", phone: "+36 30 123 4567" }, senderGaps: [] }} campaignId={2} senderUserId={9} senders={SENDERS} />);
    expect(screen.queryByText("Nincs feladó kiválasztva")).toBeNull();
    expect(screen.queryByText("A feladónak nincs telefonszáma")).toBeNull();
  });
});
