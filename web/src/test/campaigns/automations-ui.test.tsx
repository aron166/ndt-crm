import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
const createAutomation = vi.fn();
vi.mock("@/app/actions/automations", () => ({
  createAutomation: (...a: unknown[]) => createAutomation(...a), deleteAutomation: vi.fn(), toggleAutomation: vi.fn(),
}));

import { CampaignAutomations } from "@/app/(app)/campaigns/[slug]/CampaignAutomations";

beforeEach(() => vi.clearAllMocks());
const base = { campaignId: 3, leadStatuses: [{ key: "contacting", label: "Hívás alatt" }], users: [] };

describe("Kampány > Automatizálás (item 5)", () => {
  it("with the outbound switch off only internal actions are offered, and an old outbound rule says it does not run", async () => {
    render(<CampaignAutomations {...base} outbound={false} rules={[{ id: 1, name: "Hook", isActive: true, triggerType: "campaign_member_replied", actionType: "webhook_out", triggerConfig: { campaignId: 3 }, actionConfig: {}, lastRunAt: null }]} />);
    expect(screen.getByText(/nem fut: a kimenő automatizmus ki van kapcsolva/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Új szabály" }));
    const opts = [...(screen.getByLabelText("Akkor") as HTMLSelectElement).options].map((o) => o.value);
    expect(opts).toEqual(["create_task", "change_lead_status", "assign_lead", "add_note"]);
  });
  it("a new rule is scoped to this campaign", async () => {
    createAutomation.mockResolvedValue({ success: true });
    render(<CampaignAutomations {...base} outbound={false} rules={[]} />);
    await userEvent.click(screen.getByRole("button", { name: "Új szabály" }));
    await userEvent.type(screen.getByLabelText("Név"), "Válaszoló visszahívása");
    await userEvent.type(screen.getByLabelText(/Feladat címe/), "Hívd vissza");
    await userEvent.click(screen.getByRole("button", { name: "Mentés" }));
    const f = createAutomation.mock.calls[0][0] as FormData;
    expect(JSON.parse(String(f.get("triggerConfig")))).toEqual({ campaignId: 3 });
    expect(f.get("triggerType")).toBe("campaign_member_replied");
    expect(JSON.parse(String(f.get("actionConfig")))).toMatchObject({ titleTemplate: "Hívd vissza" });
  });
  it("with the switch on, e-mail and webhook appear", async () => {
    render(<CampaignAutomations {...base} outbound rules={[]} />);
    await userEvent.click(screen.getByRole("button", { name: "Új szabály" }));
    const opts = [...(screen.getByLabelText("Akkor") as HTMLSelectElement).options].map((o) => o.value);
    expect(opts).toContain("webhook_out");
  });
});

describe("outbound e-mail rule (Vanda #193-1)", () => {
  it("has its own subject and a multi-line body; the rule name is never the subject", async () => {
    createAutomation.mockResolvedValue({ success: true });
    render(<CampaignAutomations {...base} outbound rules={[]} />);
    await userEvent.click(screen.getByRole("button", { name: "Új szabály" }));
    await userEvent.type(screen.getByLabelText("Név"), "Belső név");
    await userEvent.selectOptions(screen.getByLabelText("Akkor"), "send_email");
    await userEvent.type(screen.getByLabelText("E-mail tárgya"), "Köszönjük a választ");
    expect(screen.getByLabelText("E-mail szövege").tagName).toBe("TEXTAREA");
    await userEvent.type(screen.getByLabelText("E-mail szövege"), "Sor egy{enter}Sor kettő");
    await userEvent.click(screen.getByRole("button", { name: "Mentés" }));
    const cfg = JSON.parse(String((createAutomation.mock.calls[0][0] as FormData).get("actionConfig")));
    expect(cfg).toMatchObject({ subjectTemplate: "Köszönjük a választ", bodyTemplate: "Sor egy\nSor kettő" });
  });
});
