import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { createItem } from "@/lib/content/service";
import { loadSegmentCopy } from "./copy-load";

vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/content/service", () => ({ createItem: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { campaign: { findFirst: vi.fn() }, contentItem: { findMany: vi.fn() } } }));

const CTA = "Válaszoljon annyit, hogy „érdekel”, és felhívom.";
const fence = (s: string) => "```\n" + s + "\n```";
const MD = [
  "Minden levél teste ugyanígy zárul:", "", fence("{{CTA}}\n\n{{sender_name}}"), "",
  "## Segment A (generálkivitelezők)", "", "Tárgy: Vágás előtt", "", fence("{{greeting}}\n\nSzöveg A."), "",
  "## Segment B (tervezők)", "", "Tárgy: Tervezéskor", "", fence("{{greeting}}\n\nSzöveg B."), "",
].join("\n");
const ctx = { tenantId: 1, userId: 7 } as Parameters<typeof loadSegmentCopy>[0];
const input = { dry_run: true, step: 1, markdown: MD, cta: CTA, source_ref: "launch/EMAIL.md" };
const ref = (s: string) => `launch/EMAIL.md#bp-step1-${s}`;

beforeEach(() => {
  vi.mocked(db.campaign.findFirst).mockResolvedValue({ id: 3, slug: "bp", status: "draft", steps: [{ position: 1, channel: "email" }] } as never);
  vi.mocked(createItem).mockImplementation(async (_a, i) => ({ ok: true, itemId: i.externalRef === ref("A") ? 11 : 12, versionId: 1, existed: i.externalRef === ref("A"), status: "in_review", ruleChecks: 0 }) as never);
});

describe("loadSegmentCopy re-load (Vanda #195-4)", () => {
  it("reports an item whose stored text differs from the file as edited, skipped, not silently", async () => {
    vi.mocked(db.contentItem.findMany).mockResolvedValue([{ externalRef: ref("A"), title: "Régi tárgy", body: "régi" }] as never);
    const r = await loadSegmentCopy(ctx, "bp", input);
    expect(r).toMatchObject({ ok: true, summary: { create: 1, existing: 1, edited_skipped: ["A"] } });
  });
  it("an unchanged existing item is not reported as edited", async () => {
    vi.mocked(db.contentItem.findMany).mockResolvedValue([
      { externalRef: ref("A"), title: "Vágás előtt", body: `{{greeting}}\n\nSzöveg A.\n\n${CTA}\n\n{{sender_name}}` },
    ] as never);
    const r = await loadSegmentCopy(ctx, "bp", input);
    expect(r).toMatchObject({ ok: true, summary: { edited_skipped: [] } });
  });
  it("the apply run also names the edited, skipped segments", async () => {
    vi.mocked(db.contentItem.findMany).mockResolvedValue([{ externalRef: ref("A"), title: "Régi tárgy", body: "régi" }] as never);
    const r = await loadSegmentCopy(ctx, "bp", { ...input, dry_run: false });
    expect(r).toMatchObject({ ok: true, dry_run: false, summary: { edited_skipped: ["A"] } });
  });
});
