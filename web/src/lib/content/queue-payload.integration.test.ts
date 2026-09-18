// @vitest-environment node
import { describe, it, expect, beforeAll } from "vitest";
const CONNECTION = process.env.CONTENT_IT_DATABASE_URL ?? "";
const enabled = /127\.0\.0\.1|localhost/.test(CONNECTION);
describe.skipIf(!enabled)("queue payload", () => {
  let db: typeof import("@/lib/db")["db"];
  let service: typeof import("@/lib/content/service");
  beforeAll(async () => {
    process.env.DATABASE_URL = CONNECTION;
    ({ db } = await import("@/lib/db"));
    service = await import("@/lib/content/service");
  });
  it("carries the dossier, reason tags, checks and self score", async () => {
    const company = await db.company.create({
      data: { tenantId: 1, name: `QC-${Date.now()}`, city: "Budapest", accountType: "Lead",
        enrichment: { apropo: ["2021 Lánchíd"] }, closenessScore: 42 } as never,
    });
    const created = await service.createItem(
      { tenantId: 1, kind: "app", appSlug: "qc" },
      { title: `QC-${Date.now()}`, body: "Az ár 250 000 Ft.", category: "email", channel: "email",
        contentType: "email", source: "qc", companyId: company.id, selfScore: 0.4, selfNote: "bizonytalan" },
    );
    if (!created.ok) throw new Error("setup");
    const queue = await service.getQueue(1, ["rewrite_requested"]);
    const item = queue.find((q) => q.id === created.itemId)!;
    expect(item).toBeTruthy();
    expect(item.company?.dossier).toMatchObject({ apropo: ["2021 Lánchíd"] });
    expect(item.company?.closenessScore).toBe(42);
    expect(item.currentVersion?.selfScore).toBe(0.4);
    expect(item.openChecks.some((c) => c.source === "rule")).toBe(true);
    await db.contentItem.update({ where: { id: created.itemId }, data: { currentVersionId: null, liveVersionId: null } });
    await db.contentItem.delete({ where: { id: created.itemId } });
    await db.company.delete({ where: { id: company.id } });
  });
});
