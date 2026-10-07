// Hungarian copy is PROPOSAL until Áron approves.
import { db } from "@/lib/db";

export type ItemContext = {
  id: number;
  title: string;
  category: string;
  purpose: string | null;
  status: string;
  body: string;
  checks: { id: number; question: string; state: string; answer: string | null }[];
};

const BODY_MAX = 6000;
const CHECKS_MAX = 30;

/** Only the item in view: never company, person, campaign contacts or metrics. */
export async function loadItemContext(tenantId: number, itemId: number): Promise<ItemContext | null> {
  const item = await db.contentItem.findFirst({
    where: { id: itemId, tenantId },
    select: {
      id: true, title: true, category: true, purpose: true, status: true, body: true,
      currentVersion: { select: { body: true } },
      checks: { orderBy: { id: "asc" }, take: CHECKS_MAX, select: { id: true, question: true, state: true, answer: true } },
    },
  });
  if (!item) return null;
  return {
    id: item.id,
    title: item.title,
    category: item.category,
    purpose: item.purpose,
    status: item.status,
    body: (item.currentVersion?.body ?? item.body).slice(0, BODY_MAX),
    checks: item.checks.slice(0, CHECKS_MAX),
  };
}

export type PageKind = "item" | "decisions" | "campaigns" | "live" | "inbox";

export function pageKind(pathname: string): PageKind | null {
  if (pathname !== "/marketing" && !pathname.startsWith("/marketing/")) return null;
  const seg = pathname.split("?")[0].split("/").filter(Boolean)[1];
  if (!seg) return "inbox";
  if (seg === "decisions" || seg === "campaigns" || seg === "live") return seg;
  return /^\d+$/.test(seg) ? "item" : "inbox";
}
