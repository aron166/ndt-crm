import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OutreachQueue from "@/app/(app)/outreach/OutreachQueue";
import { listDrafts, settleStuckDraftAction, type DraftListRow } from "@/app/actions/email-drafts";

vi.mock("next/link", () => ({ default: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }));
vi.mock("@/app/actions/outreach-campaigns", () => ({ setCampaignTarget: vi.fn(), markDraftReplied: vi.fn() }));
vi.mock("@/app/(app)/outreach/DueToday", () => ({ MarkSentControl: () => null }));
vi.mock("@/app/actions/email-drafts", () => ({
  listDrafts: vi.fn().mockResolvedValue({ drafts: [], truncated: false }),
  updateDraft: vi.fn(), approveDraft: vi.fn(), approveAll: vi.fn(), sendDraft: vi.fn(), getDraftBody: vi.fn(),
  saveOutreachSettings: vi.fn(),
  settleStuckDraftAction: vi.fn().mockResolvedValue({ ok: true }),
}));

const mk = (id: number, ageMin: number): DraftListRow => ({
  id, companyId: 1, companyName: "Ceg", personId: null, personName: null, campaign: "bp", step: 1, subject: "S", body: "B",
  toEmail: null, status: "sending", threadKey: null, providerMessageId: null, lastError: null, sentAt: null,
  updatedAt: new Date(Date.now() - ageMin * 60_000).toISOString(), createdAt: new Date().toISOString(),
  senderUserId: null, wave: null, dueAt: null, sentVia: "mailbox", externalThreadId: null, replyType: null, repliedAt: null,
  templateBlockedReason: null,
} as DraftListRow);

const SENT = "Elment (megnéztem az Elküldöttek mappát)";
const draw = (rows: DraftListRow[]) =>
  render(<OutreachQueue initialDrafts={rows} campaigns={["bp"]} initialSettings={{ replyTo: null, footer: null } as never} senders={[]} />);

beforeEach(() => vi.clearAllMocks());

describe("stuck sending row", () => {
  it("shows both buttons after 10 minutes and each calls the action", async () => {
    const r = mk(7, 11);
    vi.mocked(listDrafts).mockResolvedValue({ drafts: [r], campaigns: ["bp"], truncated: false });
    draw([r]);
    await userEvent.click(screen.getByRole("button", { name: SENT }));
    expect(settleStuckDraftAction).toHaveBeenCalledWith(7, "sent");
    await userEvent.click(await screen.findByRole("button", { name: "Nem ment el" }));
    expect(settleStuckDraftAction).toHaveBeenCalledWith(7, "not_sent");
  });
  it("shows neither for a recent sending row", () => {
    draw([mk(8, 2)]);
    expect(screen.queryByRole("button", { name: SENT })).toBeNull();
    expect(screen.queryByRole("button", { name: "Nem ment el" })).toBeNull();
  });
});
