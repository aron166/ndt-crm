// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/actor", () => ({
  getActor: vi.fn(),
  NOT_A_CRM_USER: "Ez a fiók nincs felvéve CRM-felhasználóként — kérj hozzáférést Árontól.",
}));
vi.mock("@/lib/db", () => ({
  db: {
    contentItem: { findFirst: vi.fn(), update: vi.fn() },
    contentVersion: { findFirst: vi.fn() },
    contentAsset: { findMany: vi.fn() },
    user: { findMany: vi.fn(), count: vi.fn() },
  },
}));
vi.mock("@/lib/content/service", () => ({
  archiveItem: vi.fn(),
  createVersion: vi.fn(),
  submitReview: vi.fn(),
}));
vi.mock("@/lib/content/storage", () => ({
  ALLOWED_MIME: {
    "image/png": "image", "image/jpeg": "image", "image/webp": "image", "image/gif": "image",
    "video/mp4": "video", "video/webm": "video", "application/pdf": "file",
  },
  MAX_ASSET_BYTES: 50 * 1024 * 1024,
  createUploadUrl: vi.fn(),
  isPathForItem: vi.fn((path: string, tenantId: number, itemId: number) => {
    const prefix = `t${tenantId}/items/${itemId}/`;
    return path.startsWith(prefix) && !path.includes("..") && !path.includes("//");
  }),
  stagingPath: vi.fn((tenantId: number, itemId: number, name: string) => `t${tenantId}/items/${itemId}/staging/${name}`),
  statObject: vi.fn(),
}));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/marketing/webhook", () => ({ dispatchApprovalWebhook: vi.fn() }));
vi.mock("@/lib/tenant-settings", () => ({ setTenantSettings: vi.fn() }));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));

import { getActor } from "@/lib/actor";
import { db } from "@/lib/db";
import { archiveItem, createVersion, submitReview } from "@/lib/content/service";
import { statObject } from "@/lib/content/storage";
import {
  submitContentReview, saveContentVersion, requestAssetUpload, archiveContent,
  updateContentMeta, getContentReviewerOptions, saveContentReviewers,
} from "./content";

const mocked = <T extends (...args: never[]) => unknown>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

const CALLER_ID = 42;

beforeEach(() => {
  vi.clearAllMocks();
  mocked(getActor).mockResolvedValue({ userId: CALLER_ID, email: "caller@example.com" });
  mocked(db.contentAsset.findMany).mockResolvedValue([]);
});

describe("non-CRM user refusal", () => {
  beforeEach(() => {
    mocked(getActor).mockResolvedValue({ userId: null, email: null });
  });

  it("submitContentReview refuses without touching the service", async () => {
    const res = await submitContentReview({ versionId: 1, verdict: "approve" });
    expect(res.ok).toBe(false);
    expect(submitReview).not.toHaveBeenCalled();
    expect(db.contentVersion.findFirst).not.toHaveBeenCalled();
  });

  it("requestAssetUpload refuses without touching storage/db", async () => {
    const res = await requestAssetUpload({ itemId: 1, fileName: "a.png", mimeType: "image/png", sizeBytes: 10 });
    expect(res.ok).toBe(false);
    expect(db.contentItem.findFirst).not.toHaveBeenCalled();
  });

  it("saveContentVersion refuses without touching the service", async () => {
    const res = await saveContentVersion({ itemId: 1, basedOnVersionId: 1, body: "hi" });
    expect(res.ok).toBe(false);
    expect(createVersion).not.toHaveBeenCalled();
    expect(db.contentAsset.findMany).not.toHaveBeenCalled();
  });

  it("archiveContent refuses without touching the service", async () => {
    const res = await archiveContent(1);
    expect(res.ok).toBe(false);
    expect(archiveItem).not.toHaveBeenCalled();
  });

  it("updateContentMeta refuses without touching the db", async () => {
    const res = await updateContentMeta(1, { title: "x" });
    expect(res.ok).toBe(false);
    expect(db.contentItem.findFirst).not.toHaveBeenCalled();
    expect(db.contentItem.update).not.toHaveBeenCalled();
  });

  it("getContentReviewerOptions refuses (empty list) without touching the db", async () => {
    const res = await getContentReviewerOptions();
    expect(res).toEqual([]);
    expect(db.user.findMany).not.toHaveBeenCalled();
  });

  it("saveContentReviewers refuses without touching the db", async () => {
    const res = await saveContentReviewers([1, 2]);
    expect(res.ok).toBe(false);
    expect(db.user.count).not.toHaveBeenCalled();
  });
});

describe("requestAssetUpload", () => {
  it("rejects a disallowed MIME type", async () => {
    const res = await requestAssetUpload({ itemId: 1, fileName: "a.zip", mimeType: "application/zip", sizeBytes: 10 });
    expect(res.ok).toBe(false);
    expect(db.contentItem.findFirst).not.toHaveBeenCalled();
  });

  it("rejects a file over 50 MB", async () => {
    const res = await requestAssetUpload({
      itemId: 1, fileName: "a.png", mimeType: "image/png", sizeBytes: 50 * 1024 * 1024 + 1,
    });
    expect(res.ok).toBe(false);
  });

  it("rejects an unknown item", async () => {
    mocked(db.contentItem.findFirst).mockResolvedValue(null);
    const res = await requestAssetUpload({ itemId: 999, fileName: "a.png", mimeType: "image/png", sizeBytes: 10 });
    expect(res.ok).toBe(false);
  });

  it("rejects an archived item", async () => {
    mocked(db.contentItem.findFirst).mockResolvedValue({ id: 1, status: "archived" });
    const res = await requestAssetUpload({ itemId: 1, fileName: "a.png", mimeType: "image/png", sizeBytes: 10 });
    expect(res.ok).toBe(false);
  });
});

describe("saveContentVersion", () => {
  it("rejects an upload path outside t1/items/<itemId>/ — createVersion not called", async () => {
    const res = await saveContentVersion({
      itemId: 5, basedOnVersionId: 1, body: "hi", uploads: [{ path: "t1/items/999/staging/x.png" }],
    });
    expect(res.ok).toBe(false);
    expect(createVersion).not.toHaveBeenCalled();
  });

  it("rejects a path containing '..' — createVersion not called", async () => {
    const res = await saveContentVersion({
      itemId: 5, basedOnVersionId: 1, body: "hi", uploads: [{ path: "t1/items/5/../secret.png" }],
    });
    expect(res.ok).toBe(false);
    expect(createVersion).not.toHaveBeenCalled();
  });

  it("errors when statObject returns null — createVersion not called", async () => {
    mocked(statObject).mockResolvedValue(null);
    const res = await saveContentVersion({
      itemId: 5, basedOnVersionId: 1, body: "hi", uploads: [{ path: "t1/items/5/staging/x.png" }],
    });
    expect(res.ok).toBe(false);
    expect(createVersion).not.toHaveBeenCalled();
  });

  it("errors on a disallowed stored MIME type — createVersion not called", async () => {
    mocked(statObject).mockResolvedValue({ size: 100, mimeType: "application/zip" });
    const res = await saveContentVersion({
      itemId: 5, basedOnVersionId: 1, body: "hi", uploads: [{ path: "t1/items/5/staging/x.zip" }],
    });
    expect(res.ok).toBe(false);
    expect(createVersion).not.toHaveBeenCalled();
  });

  it("keepAssetIds filters the base version's assets; kept + upload + link land on createVersion in order", async () => {
    mocked(db.contentAsset.findMany).mockResolvedValue([
      { id: 1, kind: "image", url: "u1", storagePath: "p1", mimeType: "image/png", sizeBytes: 1, caption: null },
      { id: 2, kind: "image", url: "u2", storagePath: "p2", mimeType: "image/png", sizeBytes: 1, caption: null },
      { id: 3, kind: "file", url: "u3", storagePath: "p3", mimeType: "application/pdf", sizeBytes: 1, caption: null },
    ]);
    mocked(statObject).mockResolvedValue({ size: 100, mimeType: "image/webp" });
    mocked(createVersion).mockResolvedValue({ ok: true, versionId: 10, number: 2 });

    const res = await saveContentVersion({
      itemId: 5,
      basedOnVersionId: 1,
      body: "hi",
      keepAssetIds: [1, 3],
      uploads: [{ path: "t1/items/5/staging/new.webp" }],
      links: [{ url: "https://example.com/x" }],
    });
    expect(res.ok).toBe(true);
    expect(createVersion).toHaveBeenCalledTimes(1);
    const call = mocked(createVersion).mock.calls[0];
    const input = call[2] as { assets: { kind: string; url: string }[] };
    expect(input.assets.map((a) => a.url)).toEqual(["u1", "u3", "t1/items/5/staging/new.webp", "https://example.com/x"]);
    expect(input.assets[input.assets.length - 1]).toMatchObject({ kind: "link", url: "https://example.com/x" });
  });

  it("rejects a javascript: link — createVersion not called", async () => {
    const res = await saveContentVersion({
      itemId: 5, basedOnVersionId: 1, body: "hi", links: [{ url: "javascript:alert(1)" }],
    });
    expect(res.ok).toBe(false);
    expect(createVersion).not.toHaveBeenCalled();
  });

  it("with no keep/uploads/links, assets is undefined (carry-forward)", async () => {
    mocked(createVersion).mockResolvedValue({ ok: true, versionId: 11, number: 2 });
    const res = await saveContentVersion({ itemId: 5, basedOnVersionId: 1, body: "hi" });
    expect(res.ok).toBe(true);
    expect(db.contentAsset.findMany).not.toHaveBeenCalled();
    const call = mocked(createVersion).mock.calls[0];
    const input = call[2] as { assets?: unknown };
    expect(input.assets).toBeUndefined();
  });
});

describe("saveContentReviewers", () => {
  it("requires exactly two distinct ids including the caller", async () => {
    const tooFew = await saveContentReviewers([CALLER_ID]);
    expect(tooFew.ok).toBe(false);

    const dup = await saveContentReviewers([CALLER_ID, CALLER_ID]);
    expect(dup.ok).toBe(false);

    const withoutCaller = await saveContentReviewers([7, 8]);
    expect(withoutCaller.ok).toBe(false);

    mocked(db.user.count).mockResolvedValue(2);
    const ok = await saveContentReviewers([CALLER_ID, 7]);
    expect(ok.ok).toBe(true);
  });
});
