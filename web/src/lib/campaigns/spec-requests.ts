// Specification requests (item 6): the only safe way to ask an agent from the campaign page today.
// The CRM never calls a model here. The button writes a task (everything is a task) tagged with
// the request set and the campaign slug; an agent with an app key lists the open ones
// (GET /api/specification-requests) and answers through POST /api/campaigns/:slug/specify,
// which closes the campaign's open requests.

import { db } from "@/lib/db";
import { audit, type AuditOptions } from "@/lib/audit";

export const SPEC_SET = "campaign_spec_request";
const CAMPAIGN_TAG = "campaign:";
const OPEN = ["created", "in_progress"];

export const specRequestTags = (slug: string) => [SPEC_SET, `${CAMPAIGN_TAG}${slug}`];

export function slugFromTags(tags: readonly string[]): string | null {
  if (!tags.includes(SPEC_SET)) return null;
  const t = tags.find((x) => x.startsWith(CAMPAIGN_TAG));
  return t ? t.slice(CAMPAIGN_TAG.length) : null;
}

/**
 * One open request per campaign: a second press returns the open one (with its text refreshed).
 * shortcut: check-then-create without a lock, two tabs at once can open two requests; the next proposal closes both, lock if it matters.
 */
export async function requestSpecification(
  ctx: { tenantId: number; userId: number }, slug: string, missing: string,
): Promise<{ ok: true; taskId: number; created: boolean } | { error: string; status: 400 | 404 | 409 }> {
  const c = await db.campaign.findFirst({ where: { tenantId: ctx.tenantId, slug }, select: { id: true, name: true, status: true } });
  if (!c) return { error: "Kampány nem található", status: 404 };
  if (c.status !== "draft" && c.status !== "paused") return { error: "Javaslatot csak piszkozat vagy szüneteltetett kampány kérhet", status: 409 };
  const text = missing.trim().slice(0, 2000);
  if (!text) return { error: "Írd le, mi hiányzik", status: 400 };
  const description = `${text}\n\nKampány: ${slug}. Válasz: POST /api/campaigns/${slug}/specify (docs/api.md, Specifikáció kérések).`;
  const open = await db.task.findFirst({
    where: { tenantId: ctx.tenantId, status: { in: OPEN }, setMembership: { hasEvery: specRequestTags(slug) } },
    select: { id: true },
  });
  if (open) {
    await db.task.update({ where: { id: open.id }, data: { description } });
    audit("task", open.id, "update", null, { description }, { tenantId: ctx.tenantId });
    return { ok: true as const, taskId: open.id, created: false };
  }
  const t = await db.task.create({
    data: {
      tenantId: ctx.tenantId, title: `Kampány specifikáció: ${c.name}`, description, type: "internal", category: "non_revenue",
      executorType: "ai_agent", setMembership: specRequestTags(slug),
    },
    select: { id: true },
  });
  audit("task", t.id, "create", null, { title: `Kampány specifikáció: ${c.name}`, slug }, { tenantId: ctx.tenantId });
  return { ok: true as const, taskId: t.id, created: true };
}

/** Open requests for an agent: task id, campaign slug and name, what is missing, when. */
export async function listSpecRequests(tenantId: number) {
  const tasks = await db.task.findMany({
    where: { tenantId, status: { in: OPEN }, setMembership: { has: SPEC_SET } },
    orderBy: { createdAt: "asc" },
    select: { id: true, description: true, createdAt: true, setMembership: true },
  });
  const slugs = tasks.map((t) => slugFromTags(t.setMembership)).filter((s): s is string => s != null);
  const camps = await db.campaign.findMany({ where: { tenantId, slug: { in: slugs } }, select: { slug: true, name: true, status: true, kind: true } });
  return tasks.flatMap((t) => {
    const slug = slugFromTags(t.setMembership);
    const c = camps.find((x) => x.slug === slug);
    return c ? [{ task_id: t.id, slug: c.slug, campaign: c.name, kind: c.kind, status: c.status, missing: t.description, created_at: t.createdAt }] : [];
  });
}

/** After a proposal landed: the campaign's open requests are done. */
export async function closeSpecRequests(tenantId: number, slug: string, opts: AuditOptions, by: string) {
  const where = { tenantId, status: { in: OPEN }, setMembership: { hasEvery: specRequestTags(slug) } };
  const open = await db.task.findMany({ where, select: { id: true } });
  if (open.length === 0) return;
  await db.task.updateMany({ where: { ...where, id: { in: open.map((t) => t.id) } }, data: { status: "done", completedAt: new Date() } });
  for (const t of open) audit("task", t.id, "update", { status: "open" }, { status: "done", by }, opts);
}
