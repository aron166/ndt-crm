import { NextResponse } from "next/server";
import { reportError } from "@/lib/report-error";
import { jsonApi, requireAppKey } from "@/lib/api/http";
import { getQueue } from "@/lib/content/service";
import { CONTENT_CATEGORIES, CONTENT_STATUSES, isContentStatus, type ContentStatus } from "@/lib/content/types";

// GET /api/content/queue — items the content-revise skill should pick up.
// App-key auth, same shape as the rest of the content API.

const api = jsonApi("GET, OPTIONS");
const json = api.json;
export const OPTIONS = api.OPTIONS;

const DEFAULT_STATUSES: ContentStatus[] = ["changes_requested", "rewrite_requested"];

export async function GET(request: Request) {
  const key = await requireAppKey(request, json);
  if (key instanceof NextResponse) return key;

  const raw = new URL(request.url).searchParams.get("status");
  let statuses: ContentStatus[] = DEFAULT_STATUSES;
  if (raw) {
    const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0 || !parts.every(isContentStatus)) {
      return json(
        { error: "Invalid status", details: { allowed: CONTENT_STATUSES } },
        400,
      );
    }
    statuses = parts as ContentStatus[];
  }

  // Optional category filter: an agent that posted a `decision` question
  // reads back whether it was answered without a human relaying it (the
  // per-item `checks` payload already carries `state` and `answer`).
  const queryParams = new URL(request.url).searchParams;
  let category: string | undefined;
  // `.has` (not the value's truthiness): an empty `?category=` is falsy and
  // would otherwise skip validation, silently returning every category.
  if (queryParams.has("category")) {
    const rawCategory = queryParams.get("category") ?? "";
    if (!(CONTENT_CATEGORIES as readonly string[]).includes(rawCategory)) {
      return json({ error: "Invalid category", details: { allowed: CONTENT_CATEGORIES } }, 400);
    }
    category = rawCategory;
  }

  try {
    const items = await getQueue(key.tenantId, statuses, { category });
    return json({ ok: true, items }, 200);
  } catch (err) {
    reportError("api.content.queue", err, { tenantId: key.tenantId });
    return json({ error: "Internal error" }, 500);
  }
}
