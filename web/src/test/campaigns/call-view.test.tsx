import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const recordCampaignOutcomeAction = vi.fn();
vi.mock("@/app/actions/campaign-hub", () => ({ recordCampaignOutcomeAction: (...a: unknown[]) => recordCampaignOutcomeAction(...a) }));

import { CampaignCallView, type CallViewData } from "@/app/(app)/calls/CampaignCallView";

const item = (id: number, name: string, city: string) => ({
  id, attempts: 0, lastOutcome: null, lastTouchedAt: null, why: null, tier: "B", city, stepPosition: 2,
  company: { id: id + 100, name, city, website: null },
  person: { id: id + 200, firstName: "Teszt", lastName: "Elek", phone: "+36 1 000 0000", email: null },
});
const DATA: CallViewData = {
  campaign: { slug: "bp", name: "Budapest", status: "running", dailyCap: 15 },
  items: [item(1, "Alfa Kft.", "XI. kerület"), item(2, "Béta Kft.", "XIII. kerület"), item(3, "Gamma Kft.", "XI. kerület")],
  touchedToday: 4, remaining: 61, script: { id: 9, title: "Kampányszkript", body: "Szkript szövege" },
};

beforeEach(() => vi.clearAllMocks());

describe("Hívás mód, campaign tab", () => {
  it("groups today's list by city and shows the campaign's own script beside the selected company", () => {
    render(<CampaignCallView slug="bp" data={DATA} />);
    const nav = screen.getByRole("navigation", { name: "Mai hívólista" });
    expect(within(nav).getAllByText(/kerület/).map((e) => e.textContent)).toEqual(["XI. kerület", "XIII. kerület"]);
    expect(within(nav).getAllByRole("button").map((b) => b.querySelector("b")?.textContent)).toEqual(["Alfa Kft.", "Gamma Kft.", "Béta Kft."]);
    expect(screen.getByText("Szkript szövege")).toBeTruthy();
    expect(screen.getByText(/Ma 4 \/ 15/)).toBeTruthy();
  });
  it("has exactly the five outcomes", () => {
    render(<CampaignCallView slug="bp" data={DATA} />);
    expect(within(screen.getByRole("group", { name: "Kimenetel" })).getAllByRole("button").map((b) => b.textContent))
      .toEqual(["Nem vették fel", "Érdeklődik", "Kéri / akarja", "Nem érdekli", "Rossz szám"]);
  });
  it("Érdeklődik promotes to a lead and moves to the next company", async () => {
    recordCampaignOutcomeAction.mockResolvedValue({ ok: true, member: { id: 1 }, lead: { id: 300, created: true } });
    render(<CampaignCallView slug="bp" data={DATA} />);
    await userEvent.click(screen.getByRole("button", { name: "Érdeklődik" }));
    expect(recordCampaignOutcomeAction).toHaveBeenCalledWith("bp", { member_id: 1, outcome: "interested" });
    expect(screen.getByRole("status").textContent).toMatch(/lead lett.*SLA feladat nélkül/);
    expect(screen.getByRole("link", { name: "Lead megnyitása" }).getAttribute("href")).toBe("/leads/300");
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Gamma Kft.");
  });
  it("no script from the pipeline: says so, ships no sample copy", () => {
    render(<CampaignCallView slug="bp" data={{ ...DATA, script: null }} />);
    expect(screen.getByText(/Nincs jóváhagyott hívásszkript/)).toBeTruthy();
  });
  it("a refused tap shows the server's reason and keeps the company", async () => {
    recordCampaignOutcomeAction.mockResolvedValue({ error: "Ez a tag most nem hívható" });
    render(<CampaignCallView slug="bp" data={DATA} />);
    await userEvent.click(screen.getByRole("button", { name: "Nem vették fel" }));
    expect(screen.getByRole("status").textContent).toMatch(/nem hívható/);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Alfa Kft.");
  });
});
