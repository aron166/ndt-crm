import { z } from "zod";
import { db } from "@/lib/db";
import { reportError } from "@/lib/report-error";
import { sendEmail } from "@/lib/integrations/resend";
import { getContentReviewers } from "./reviewers";
import { CATEGORY_LABEL } from "./labels";
import type { ContentCategory } from "./types";

/**
 * Daily digest email to reviewers (spec §5): "N anyag vár Önre", oldest first,
 * skipped when N = 0. Split pure/DB the same way the rest of lib/content does —
 * buildDigest and isDigestTime take no DB dependency so they're trivially
 * testable; sendContentDigests is the only part that touches the database.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
/** Matches queries.ts STALE_REVIEW_MS (3 days) expressed in whole days. */
const OVERDUE_DAYS = 3;

export interface DigestItem {
  id: number;
  title: string;
  category: string;
  waitingSince: Date;
}

export interface DigestInput {
  reviewerId: number;
  reviewerName: string;
  items: DigestItem[];
  now: Date;
  baseUrl: string;
}

/** "Nagy Péter" (last-name-first) → "Péter"; a single token is used as-is. */
function firstName(reviewerName: string): string {
  const parts = reviewerName.trim().split(/\s+/);
  return parts[parts.length - 1] || reviewerName;
}

export function buildDigest(input: DigestInput): { subject: string; text: string } | null {
  const { reviewerName, items, now, baseUrl } = input;
  if (items.length === 0) return null;

  const oldestFirst = [...items].sort((a, b) => a.waitingSince.getTime() - b.waitingSince.getTime());
  const lines = oldestFirst.map((item) => {
    const days = Math.floor((now.getTime() - item.waitingSince.getTime()) / DAY_MS);
    const label = CATEGORY_LABEL[item.category as ContentCategory] ?? item.category;
    const warn = days > OVERDUE_DAYS ? " ⚠️" : "";
    return `- ${item.title} (${label}) — ${days} napja vár${warn} — ${baseUrl}/marketing/${item.id}`;
  });

  const subject = `${items.length} anyag vár Önre`;
  const text = [
    `Kedves ${firstName(reviewerName)}!`,
    "",
    ...lines,
    "",
    `Az összes anyag itt: ${baseUrl}/marketing`,
    "A napi összefoglaló ott kapcsolható ki.",
  ].join("\n");
  return { subject, text };
}

/** Mon–Fri, 08:00 local time in Europe/Budapest — independent of process TZ/DST. */
export function isDigestTime(now: Date): boolean {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Budapest",
    hour: "numeric",
    hour12: false,
    weekday: "short",
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  const weekday = parts.find((p) => p.type === "weekday")?.value;
  const isWeekday = weekday !== undefined && weekday !== "Sat" && weekday !== "Sun";
  return isWeekday && hour === 8;
}

const optOutSchema = z.array(z.number().int().positive());

/** `tenants.settings.contentDigestOptOut` — reviewer user ids who turned the digest off. */
export function digestOptOutFromSettings(settings: unknown): number[] {
  const parsed = optOutSchema.safeParse((settings as { contentDigestOptOut?: unknown } | null)?.contentDigestOptOut);
  return parsed.success ? parsed.data : [];
}

/**
 * Sends the digest to every configured reviewer who hasn't opted out and has
 * pending items. Never throws — a failure for one reviewer is reported and
 * the others still get theirs. `skipLog: true` on the send: a digest is not a
 * CRM interaction with a person/company.
 */
export async function sendContentDigests(
  tenantId: number,
  now: Date = new Date(),
  opts: { force?: boolean } = {},
): Promise<{ sent: number; skipped: number; reason?: string }> {
  if (!opts.force && !isDigestTime(now)) {
    return { sent: 0, skipped: 0, reason: "not_digest_time" };
  }

  const reviewerIds = await getContentReviewers(tenantId);
  if (reviewerIds.length === 0) return { sent: 0, skipped: 0, reason: "no_reviewers" };

  const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
  const optOut = digestOptOutFromSettings(tenant?.settings);
  const baseUrl = process.env.APP_BASE_URL ?? "https://ndt-crm.vercel.app";

  let sent = 0;
  let skipped = 0;

  for (const reviewerId of reviewerIds) {
    try {
      if (optOut.includes(reviewerId)) {
        skipped++;
        continue;
      }
      const user = await db.user.findFirst({
        where: { id: reviewerId, tenantId },
        select: { name: true, email: true },
      });
      if (!user) {
        skipped++;
        continue;
      }

      const pending = await db.contentItem.findMany({
        where: {
          tenantId,
          status: { in: ["in_review", "draft"] },
          currentVersion: { reviews: { none: { reviewerUserId: reviewerId } } },
        },
        select: { id: true, title: true, category: true, currentVersion: { select: { createdAt: true } } },
      });

      const digest = buildDigest({
        reviewerId,
        reviewerName: user.name,
        items: pending
          .filter((i) => i.currentVersion)
          .map((i) => ({ id: i.id, title: i.title, category: i.category, waitingSince: i.currentVersion!.createdAt })),
        now,
        baseUrl,
      });
      if (!digest) {
        skipped++;
        continue;
      }

      const res = await sendEmail({ tenantId, to: user.email, subject: digest.subject, text: digest.text, skipLog: true });
      if (res.ok) {
        sent++;
      } else {
        skipped++;
        reportError("content.digest", new Error(res.error), { reviewerId });
      }
    } catch (err) {
      skipped++;
      reportError("content.digest", err, { reviewerId });
    }
  }

  return { sent, skipped };
}
