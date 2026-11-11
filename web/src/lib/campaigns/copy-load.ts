// Load a segment copy file into a campaign's e-mail step as PROPOSALS, through the content approval
// pipeline's own write path (createItem: version 1, in review, author = the session user). Nothing
// is approved, nothing goes live, no draft is made. Each item is tagged
// source_meta { campaignStep, segment } so the step picks it per member segment (lib/campaigns/email-preview
// pickAsset). Idempotent on external_ref. Session only: the audit trail names a person, never an app key.

import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { createItem } from "@/lib/content/service";
import { parseSegmentCopy, type CopyRefusal } from "./copy-file";
import type { CampaignCtx, Fail } from "./service";

export const copyLoadSchema = z.object({
  dry_run: z.boolean().default(true),
  step: z.number().int().min(1).max(20),
  markdown: z.string().min(1).max(200_000),
  cta: z.string().trim().min(1).max(500),
  /** Where the file lives, for external_ref and the reviewer: "launch-2026-11/demo/EMAIL.md". */
  source_ref: z.string().trim().regex(/^[A-Za-z0-9._/-]{1,120}$/),
});
export type CopyLoadInput = z.infer<typeof copyLoadSchema>;

const fail = (status: Fail["status"], error: string): Fail => ({ error, status });

export async function loadSegmentCopy(ctx: CampaignCtx, slug: string, input: CopyLoadInput) {
  if (ctx.userId == null) return fail(403, "Ehhez bejelentkezett CRM felhasználó kell, app kulcs nem elég");
  const c = await db.campaign.findFirst({ where: { tenantId: ctx.tenantId, slug }, select: { id: true, slug: true, status: true, steps: { select: { position: true, channel: true } } } });
  if (!c) return fail(404, "Kampány nem található");
  if (c.status !== "draft" && c.status !== "paused") return fail(409, "Javaslat csak piszkozat vagy szüneteltetett kampányhoz tölthető");
  if (c.steps.find((s) => s.position === input.step)?.channel !== "email") return fail(400, `A ${input.step}. lépés nem e-mail lépés`);
  const { items, refused } = parseSegmentCopy(input.markdown, input.cta);
  const planned = items.map((i) => ({ ...i, externalRef: `${input.source_ref}#${c.slug}-step${input.step}-${i.segment}` }));
  const existing = new Set((await db.contentItem.findMany({
    where: { tenantId: ctx.tenantId, externalRef: { in: planned.map((p) => p.externalRef) } }, select: { externalRef: true },
  })).map((x) => x.externalRef));
  const summary = {
    parsed: items.length, create: planned.filter((p) => !existing.has(p.externalRef)).length, existing: existing.size,
    refused: refused as CopyRefusal[], segments: planned.map((p) => p.segment),
  };
  if (input.dry_run) return { ok: true as const, dry_run: true, summary };

  const actor = { tenantId: ctx.tenantId, kind: "user" as const, userId: ctx.userId };
  const created: { itemId: number; segment: string; existed: boolean }[] = [];
  for (const p of planned) {
    const r = await createItem(actor, {
      title: p.subject, body: p.body, category: "email", channel: "email", contentType: "email", format: "plain_text_email",
      purpose: `${c.slug}, ${input.step}. lépés, ${p.segment} szegmens (${p.label}). JAVASLAT`,
      externalRef: p.externalRef, campaignId: c.id, source: "manual",
      changeNote: "JAVASLAT (PROPOSAL): Áron jóváhagyása és Péter hangellenőrzése szükséges",
      sourceMeta: { campaignStep: input.step, segment: p.segment, file: input.source_ref } as Prisma.InputJsonValue,
    });
    if (!r.ok) return fail(r.status === 404 ? 400 : (r.status as Fail["status"]), `${p.segment} szegmens: ${r.error}`);
    created.push({ itemId: r.itemId, segment: p.segment, existed: r.existed });
  }
  audit("campaign", c.id, "update", null, { copyProposals: created.filter((x) => !x.existed).map((x) => x.itemId), step: input.step, file: input.source_ref }, { tenantId: ctx.tenantId });
  return { ok: true as const, dry_run: false, summary, created };
}
