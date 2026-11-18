import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
const A = vi.hoisted(() => ({ exportCampaignCsvAction: vi.fn(), markExportedAction: vi.fn() }));
vi.mock("@/app/actions/campaign-hub", () => A);

import { ExportPanel } from "@/app/(app)/campaigns/[slug]/ExportPanel";

beforeEach(() => vi.clearAllMocks());
const MARK = /Exportáltnak jelölöm/;

describe("ExportPanel", () => {
  it("export then mark sends exactly the exported ids", async () => {
    A.exportCampaignCsvAction.mockResolvedValue({ ok: true, csv: "x", memberIds: [4, 9, 11], skippedNoEmail: 2 });
    A.markExportedAction.mockResolvedValue({ ok: true, marked: 3 });
    render(<ExportPanel slug="bp" queued={5} />);
    expect(screen.queryByRole("button", { name: MARK })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "CSV letöltése" }));
    expect(await screen.findByText("3 tag a fájlban; 2 tag kimaradt (nincs e-mail cím).")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Exportáltnak jelölöm (3)" }));
    expect(A.markExportedAction).toHaveBeenCalledWith("bp", [4, 9, 11]);
    expect(await screen.findByText("3 tag megjelölve: a CRM már nem küld nekik e-mailt.")).toBeTruthy();
  });
  it("no mark button when the export returned 0 ids", async () => {
    A.exportCampaignCsvAction.mockResolvedValue({ ok: true, csv: "x", memberIds: [], skippedNoEmail: 1 });
    render(<ExportPanel slug="bp" queued={0} />);
    await userEvent.click(screen.getByRole("button", { name: "CSV letöltése" }));
    await screen.findByText(/0 tag a fájlban/);
    expect(screen.queryByRole("button", { name: MARK })).toBeNull();
  });
  it("an export error shows in the alert and no mark button", async () => {
    A.exportCampaignCsvAction.mockResolvedValue({ error: "Nincs jogosultság" });
    render(<ExportPanel slug="bp" queued={3} />);
    await userEvent.click(screen.getByRole("button", { name: "CSV letöltése" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Nincs jogosultság");
    expect(screen.queryByRole("button", { name: MARK })).toBeNull();
  });
});
