import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SequenceEditor } from "@/app/(app)/campaigns/[slug]/SequenceEditor";
import { foldRows, type SeqRow } from "@/lib/campaigns/labels";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

let last: SeqRow[] = [];
function Harness({ start, emailFirst = true }: { start: SeqRow[]; emailFirst?: boolean }) {
  const [rows, setRows] = useState(start);
  last = rows;
  return <SequenceEditor rows={rows} onChange={setRows} touchKinds={["email", "call"]} emailFirst={emailFirst}
    assets={[{ id: 5, title: "Első levél", status: "live", version: 2 }]} />;
}

describe("sequence editor (item 4)", () => {
  it("adds an e-mail, a wait and a call follow-up, links the asset version, and folds to steps", async () => {
    render(<Harness start={[]} />);
    await userEvent.click(screen.getByRole("button", { name: "+ E-mail" }));
    await userEvent.selectOptions(screen.getByLabelText("1. lépés anyaga"), "5");
    await userEvent.click(screen.getByRole("button", { name: "+ Várakozás" }));
    await userEvent.click(screen.getByRole("button", { name: "+ Hívás" }));
    expect(screen.getAllByRole("option", { name: /Első levél v2 \(jóváhagyva/ }).length).toBe(2);
    expect(foldRows(last)).toEqual({ steps: [
      { channel: "email", wait_days: 0, audience_rule: "all", content_item_id: 5 },
      { channel: "call", wait_days: 2, audience_rule: "no_reply", content_item_id: null },
    ] });
  });
  it("reorders and removes; a call first warns for prospects, not for leads by stage", async () => {
    const start: SeqRow[] = [{ kind: "email", condition: "all" }, { kind: "call", condition: "no_reply" }];
    const { unmount } = render(<Harness start={start} />);
    await userEvent.click(screen.getByRole("button", { name: "2. sor feljebb" }));
    expect(last.map((r) => r.kind)).toEqual(["call", "email"]);
    expect(screen.getByRole("alert").textContent).toMatch(/első lépés az e-mail/);
    await userEvent.click(screen.getByRole("button", { name: "1. sor törlése" }));
    expect(last.map((r) => r.kind)).toEqual(["email"]);
    unmount();
    render(<Harness start={[{ kind: "call", condition: "all" }]} emailFirst={false} />);
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("offers no 'opened' condition, and 'replied' only on a call", () => {
    render(<Harness start={[{ kind: "email", condition: "all" }, { kind: "call", condition: "all" }]} />);
    const email = [...(screen.getByLabelText("1. lépés kinek") as HTMLSelectElement).options].map((o) => o.value);
    const call = [...(screen.getByLabelText("2. lépés kinek") as HTMLSelectElement).options].map((o) => o.value);
    expect(email).toEqual(["all", "no_reply"]);
    expect(call).toEqual(["all", "no_reply", "replied"]);
    expect(screen.getByText(/Megnyitás \(opened\) feltétel nincs/)).toBeTruthy();
  });
});
