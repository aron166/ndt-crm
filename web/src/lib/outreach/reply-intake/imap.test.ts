// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({ ctor: vi.fn(), search: vi.fn(), fetch: vi.fn(), fetchOne: vi.fn() }));
vi.mock("imapflow", () => ({
  ImapFlow: class {
    constructor(opts: unknown) { m.ctor(opts); }
    connect = async () => {};
    getMailboxLock = async () => ({ release() {} });
    logout = async () => {};
    search = m.search;
    fetch = m.fetch;
    fetchOne = m.fetchOne;
  },
}));

import { fetchRecent } from "./imap";

const cfg = { host: "h", port: 993, user: "u", pass: "p" };
async function* envs(list: { uid: number; envelope: { messageId?: string } }[]) { for (const e of list) yield e; }
const none = async () => new Set<string>();

beforeEach(() => {
  vi.resetAllMocks();
  m.fetchOne.mockImplementation(async (uid: string) => ({ source: Buffer.from("mail " + uid) }));
});

describe("fetchRecent", () => {
  it("sets connection, greeting and socket timeouts (Vanda #203-8)", async () => {
    m.search.mockResolvedValue([]);
    await fetchRecent(cfg, none);
    expect(m.ctor.mock.calls[0][0]).toMatchObject({ connectionTimeout: 15000, greetingTimeout: 10000, socketTimeout: 30000 });
  });

  it("search returning false -> complete false, nothing fetched (Vanda #203-1)", async () => {
    m.search.mockResolvedValue(false);
    expect(await fetchRecent(cfg, none)).toEqual({ messages: [], complete: false });
  });

  it("fetches envelopes first, downloads the source only of unprocessed ones; no Message-ID is always fetched (Vanda #203-8)", async () => {
    m.search.mockResolvedValue([1, 2, 3]);
    m.fetch.mockReturnValue(envs([{ uid: 1, envelope: { messageId: "<a@x>" } }, { uid: 2, envelope: { messageId: "<b@x>" } }, { uid: 3, envelope: {} }]));
    const isProcessed = vi.fn(async () => new Set(["<a@x>"]));
    const r = await fetchRecent(cfg, isProcessed);
    expect(m.fetch.mock.calls[0][1]).toEqual({ uid: true, envelope: true });
    expect(isProcessed).toHaveBeenCalledWith(["<a@x>", "<b@x>"]);
    expect(r.complete).toBe(true);
    expect(r.messages.map(String)).toEqual(["mail 2", "mail 3"]);
  });

  it("caps the downloads at 100 per poll, newest first, and reports incomplete (Vanda #203-8)", async () => {
    const uids = Array.from({ length: 130 }, (_, i) => i + 1);
    m.search.mockResolvedValue(uids);
    m.fetch.mockReturnValue(envs(uids.map((uid) => ({ uid, envelope: { messageId: `<${uid}@x>` } }))));
    const r = await fetchRecent(cfg, none);
    expect(r.messages).toHaveLength(100);
    expect(r.complete).toBe(false);
    expect(m.fetchOne).toHaveBeenCalledWith("130", { source: true }, { uid: true });
    expect(m.fetchOne).not.toHaveBeenCalledWith("30", expect.anything(), expect.anything());
  });
});
