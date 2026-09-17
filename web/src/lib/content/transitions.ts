import { CLAIM_TTL_MS, REQUESTABLE_STATUSES, type ContentStatus, type Verdict } from "./types";

/**
 * THE content status machine (spec §1). Pure: state + event in, new state out.
 * lib/content/service.ts is the only caller that writes the result.
 *
 *   new version            → in_review (reviews belong to versions, so they reset by construction)
 *   any "rewrite"          → rewrite_requested
 *   else any "changes"     → changes_requested
 *   every reviewer approves → live (liveVersionId = currentVersionId)
 *   AI claim               → ai_working (only from a requestable status, or a stale claim)
 *   stale claim released   → the status the claim was taken from
 *
 * The race rule (an AI version posted after a HUMAN version since the claim is
 * rejected) needs version history, so the service checks it before emitting
 * `version_created`; this function trusts that it did.
 */

export interface ItemState {
  status: ContentStatus;
  currentVersionId: number | null;
  liveVersionId: number | null;
  claimedAt: Date | null;
  claimedFrom: ContentStatus | null;
}

export interface ReviewRow {
  reviewerUserId: number;
  verdict: Verdict;
}

export type ContentEvent =
  | { type: "version_created"; versionId: number }
  | { type: "reviews_changed"; reviewers: number[]; reviews: ReviewRow[] }
  | { type: "claim"; now: Date }
  | { type: "release_stale"; now: Date }
  | { type: "archive" };

export type TransitionResult =
  | { ok: true; state: ItemState; wentLive: boolean }
  | { ok: false; code: "conflict" | "invalid"; reason: string };

export function isClaimStale(claimedAt: Date | null, now: Date): boolean {
  return claimedAt !== null && now.getTime() - claimedAt.getTime() > CLAIM_TTL_MS;
}

/**
 * Status implied by the reviews on the CURRENT version. Only configured
 * reviewers count. An empty reviewer list can never produce `live` — a
 * misconfigured tenant must not auto-publish.
 */
export function statusFromReviews(
  reviewers: number[],
  reviews: ReviewRow[],
): "in_review" | "changes_requested" | "rewrite_requested" | "live" {
  const byReviewer = new Map<number, Verdict>();
  for (const r of reviews) if (reviewers.includes(r.reviewerUserId)) byReviewer.set(r.reviewerUserId, r.verdict);
  const verdicts = [...byReviewer.values()];
  if (verdicts.includes("rewrite")) return "rewrite_requested";
  if (verdicts.includes("changes")) return "changes_requested";
  if (reviewers.length > 0 && reviewers.every((id) => byReviewer.get(id) === "approve")) return "live";
  return "in_review";
}

const ok = (state: ItemState, wentLive = false): TransitionResult => ({ ok: true, state, wentLive });
const conflict = (reason: string): TransitionResult => ({ ok: false, code: "conflict", reason });

export function applyEvent(state: ItemState, event: ContentEvent): TransitionResult {
  switch (event.type) {
    case "version_created":
      if (state.status === "archived") return conflict("archived item");
      return ok({ ...state, status: "in_review", currentVersionId: event.versionId, claimedAt: null, claimedFrom: null });

    case "reviews_changed": {
      if (state.status === "archived") return conflict("archived item");
      if (state.status === "ai_working") return conflict("AI is rewriting this item");
      if (state.currentVersionId === null) return { ok: false, code: "invalid", reason: "no current version" };
      const next = statusFromReviews(event.reviewers, event.reviews);
      if (next === "live") {
        const wentLive = state.liveVersionId !== state.currentVersionId;
        return ok({ ...state, status: "live", liveVersionId: state.currentVersionId }, wentLive);
      }
      // A live item whose NEW version is under review keeps its old live version.
      return ok({ ...state, status: next });
    }

    case "claim": {
      const stale = state.status === "ai_working" && isClaimStale(state.claimedAt, event.now);
      if (!REQUESTABLE_STATUSES.includes(state.status) && !stale) {
        return conflict(`not claimable in status ${state.status}`);
      }
      const from = stale ? (state.claimedFrom ?? "rewrite_requested") : state.status;
      return ok({ ...state, status: "ai_working", claimedAt: event.now, claimedFrom: from });
    }

    case "release_stale":
      if (state.status !== "ai_working" || !isClaimStale(state.claimedAt, event.now)) return ok(state);
      return ok({ ...state, status: state.claimedFrom ?? "rewrite_requested", claimedAt: null, claimedFrom: null });

    case "archive":
      return ok({ ...state, status: "archived", claimedAt: null, claimedFrom: null });
  }
}
