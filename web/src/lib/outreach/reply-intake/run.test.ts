// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const m = vi.hoisted(() => ({
  create: vi.fn(), findUnique: vi.fn(), update: vi.fn(),
  draftFindFirst: vi.fn(), queryRaw: vi.fn(), executeRaw: vi.fn(),
  record: vi.fn(), optOut: vi.fn(), reportError: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  db: {
    emailProviderEvent: { create: m.create, findUnique: m.findUnique, update: m.update },
    emailDraft: { findFirst: m.draftFindFirst },
    $queryRaw: m.queryRaw, $executeRaw: m.executeRaw,
  },
}));
vi.mock("@/lib/outreach/record-reply", () => ({ recordDraftReply: m.record }));
vi.mock("@/lib/outreach/unsubscribe", () => ({ applyOptOut: m.optOut }));
vi.mock("@/lib/report-error", () => ({ reportError: m.reportError }));

import { runReplyIntake, markInboxChecked } from "./run";

const fx = (n: string) => readFileSync(path.join(__dirname, "fixtures", n));
const NOW = new Date("2026-11-12T10:00:00Z");

beforeEach(() => {
  vi.resetAllMocks();
  m.create.mockResolvedValue({ id: 5 });
  m.update.mockResolvedValue({});
  m.queryRaw.mockResolvedValue([]);
  m.draftFindFirst.mockResolvedValue(null);
  m.record.mockResolvedValue({ ok: true, leadId: 9, deduped: false });
  m.optOut.mockResolvedValue({ suppressed: true, memberUpdated: false });
});

describe("runReplyIntake", () => {
  it("reply matched by exact address -> recordDraftReply once, replyType null, row marked processed", async () => {
    m.draftFindFirst.mockResolvedValueOnce({ id: 11 });
    const r = await runReplyIntake(1, [fx("plain-reply.eml")], NOW);
    expect(r).toMatchObject({ ok: true, seen: 0, new: 1, replies: 1, unmatched: 0 });
    expect(m.record).toHaveBeenCalledTimes(1);
    expect(m.record).toHaveBeenCalledWith(1, expect.objectContaining({ draftId: 11, replyType: null, appSlug: "reply-intake" }));
    expect(m.create.mock.calls[0][0].data).toMatchObject({ provider: "imap", eventId: "<plain-1@mail.pelda-kft.hu>", eventType: "imap.reply" });
    expect(m.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ draftId: 11, processedAt: NOW }) }));
  });

  it("matched by In-Reply-To through a stored resend message id (checked first)", async () => {
    m.queryRaw.mockResolvedValueOnce([{ id: 42, status: "sent" }]);
    await runReplyIntake(1, [fx("plain-reply.eml")], NOW);
    expect(m.record).toHaveBeenCalledWith(1, expect.objectContaining({ draftId: 42 }));
    expect(m.draftFindFirst).not.toHaveBeenCalled();
  });

  it("falls back to the company domain, but never for a free-mail domain", async () => {
    m.draftFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 21 });
    await runReplyIntake(1, [fx("plain-reply.eml")], NOW);
    expect(m.draftFindFirst.mock.calls[1][0].where.toEmail).toEqual({ endsWith: "@pelda-kft.hu", mode: "insensitive" });
    expect(m.record).toHaveBeenCalledWith(1, expect.objectContaining({ draftId: 21 }));

    vi.clearAllMocks();
    m.create.mockResolvedValue({ id: 6 });
    m.queryRaw.mockResolvedValue([]);
    m.draftFindFirst.mockResolvedValue(null);
    const gmail = Buffer.from("From: x@gmail.com\r\nMessage-ID: <g@x>\r\nSubject: Re: a\r\n\r\nErdekel\r\n");
    const r = await runReplyIntake(1, [gmail], NOW);
    expect(m.draftFindFirst).toHaveBeenCalledTimes(1); // address only
    expect(r.unmatched).toBe(1);
    expect(m.record).not.toHaveBeenCalled();
  });

  it("unmatched reply is stored only", async () => {
    const r = await runReplyIntake(1, [fx("plain-reply.eml")], NOW);
    expect(r.unmatched).toBe(1);
    expect(m.record).not.toHaveBeenCalled();
    expect(m.create).toHaveBeenCalledTimes(1);
  });

  it("an already-recorded reply (error text) counts as handled", async () => {
    m.draftFindFirst.mockResolvedValueOnce({ id: 11 });
    m.record.mockResolvedValue({ ok: false, error: "Erre a megkeresésre már rögzítettünk választ" });
    const r = await runReplyIntake(1, [fx("plain-reply.eml")], NOW);
    expect(r.replies).toBe(1);
    expect(m.reportError).not.toHaveBeenCalled();
    expect(m.update).toHaveBeenCalled();
  });

  it("an opt-out from someone we never mailed suppresses nobody (Nate review of E)", async () => {
    const r = await runReplyIntake(1, [fx("opt-out.eml")], NOW);
    expect(m.optOut).not.toHaveBeenCalled();
    expect(r.unmatched).toBe(1);
  });

  it("opt-out -> applyOptOut unsubscribe, no recordDraftReply", async () => {
    m.draftFindFirst.mockResolvedValueOnce({ id: 11 });
    const r = await runReplyIntake(1, [fx("opt-out.eml")], NOW);
    expect(r.optOuts).toBe(1);
    expect(m.optOut).toHaveBeenCalledWith(1, "anna@pelda-kft.hu", { kind: "unsubscribe", source: "imap_reply", agent: "reply-intake", draftId: 11 });
    expect(m.record).not.toHaveBeenCalled();
  });

  it("bounce -> applyOptOut bounce for the failed recipient", async () => {
    const r = await runReplyIntake(1, [fx("bounce-dsn.eml")], NOW);
    expect(r.bounces).toBe(1);
    expect(m.optOut).toHaveBeenCalledWith(1, "dead@pelda-kft.hu", { kind: "bounce", source: "imap_bounce", agent: "reply-intake" });
  });

  it("auto and ignore -> stored only", async () => {
    const r = await runReplyIntake(1, [fx("out-of-office.eml"), fx("from-ourselves.eml")], NOW, ["ndt.hu"]);
    expect(r).toMatchObject({ new: 2, autos: 1, ignored: 1 });
    expect(m.record).not.toHaveBeenCalled();
    expect(m.optOut).not.toHaveBeenCalled();
  });

  it("same message again: P2002 + processedAt set -> skipped, effects once", async () => {
    m.create.mockRejectedValueOnce({ code: "P2002" });
    m.findUnique.mockResolvedValueOnce({ id: 5, processedAt: NOW });
    const r = await runReplyIntake(1, [fx("opt-out.eml")], NOW);
    expect(r).toMatchObject({ seen: 1, new: 0, optOuts: 0 });
    expect(m.optOut).not.toHaveBeenCalled();
  });

  it("P2002 with processedAt null -> effects rerun", async () => {
    m.create.mockRejectedValueOnce({ code: "P2002" });
    m.findUnique.mockResolvedValueOnce({ id: 5, processedAt: null });
    const r = await runReplyIntake(1, [fx("opt-out.eml")], NOW);
    expect(r).toMatchObject({ seen: 0, new: 1, optOuts: 1 });
    expect(m.optOut).toHaveBeenCalledTimes(1);
  });

  it("one message throwing does not stop the next; its row stays unprocessed", async () => {
    m.optOut.mockRejectedValueOnce(new Error("boom"));
    const r = await runReplyIntake(1, [fx("opt-out.eml"), fx("bounce-dsn.eml")], NOW);
    expect(m.reportError).toHaveBeenCalledTimes(1);
    expect(m.optOut).toHaveBeenCalledTimes(2);
    expect(r.bounces).toBe(1);
    expect(m.update).toHaveBeenCalledTimes(1); // only the bounce was marked processed
  });
});

describe("markInboxChecked", () => {
  it("one atomic jsonb_set UPDATE", async () => {
    await markInboxChecked(1, NOW);
    expect(m.executeRaw).toHaveBeenCalledTimes(1);
    const [strings, ...vals] = m.executeRaw.mock.calls[0];
    expect(strings.join("?")).toContain("jsonb_set");
    expect(vals).toEqual([NOW.toISOString(), 1]);
  });
});
