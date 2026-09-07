import type { ContentStatus } from "./types";

// Allowed status transitions for a content item. Pure + unit-testable.
//
//   draft → in_review → approved → (scheduled) → published
//   any pre-published state → rejected
//   rejected / approved → draft (back to editing)
//
// `published` is terminal. The matrix is the single source of truth; the
// actions layer calls assertTransition before any status write.
const ALLOWED: Record<ContentStatus, ContentStatus[]> = {
  draft: ["in_review", "rejected"],
  in_review: ["approved", "rejected", "draft"],
  approved: ["scheduled", "published", "rejected", "draft"],
  scheduled: ["published", "rejected", "draft"],
  published: [],
  rejected: ["draft"],
};

export function canTransition(from: ContentStatus, to: ContentStatus): boolean {
  if (from === to) return false;
  return ALLOWED[from]?.includes(to) ?? false;
}

export class InvalidTransitionError extends Error {
  constructor(from: ContentStatus, to: ContentStatus) {
    super(`Invalid content status transition: ${from} → ${to}`);
    this.name = "InvalidTransitionError";
  }
}

export function assertTransition(from: ContentStatus, to: ContentStatus): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}
