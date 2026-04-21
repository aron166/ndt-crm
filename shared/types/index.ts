// Shared types used by both frontend and backend.
// Import from this file in both frontend/src and backend/src.

// ─── Pagination ───────────────────────────────────────────────

export interface PaginationMeta {
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

// ─── Status Codes ─────────────────────────────────────────────

export const PIPELINE_STATUS = {
  0: 'KUKA',               // junk/dead
  1: 'NEM_HIVTUK',         // not called
  2: 'HIVTUK_NEM_ERTUK_EL', // called, no answer
  3: 'HIVTUK_BESZELJENK',  // called, interested
  4: 'HIVTUK_NEM_KELL',    // called, not interested
  5: 'HIVTUK_KELL',        // called, wants it
  6: 'KIMENT_PENDING',     // proposal sent, pending
  7: 'KIMENT_CL',          // sent, Closed Lost
  8: 'KIMENT_CW',          // sent, Closed Won
} as const;

export type PipelineStatusCode = keyof typeof PIPELINE_STATUS;

// ─── Deal Stages ──────────────────────────────────────────────

export type DealStage =
  | 'prospecting'
  | 'proposal'
  | 'negotiation'
  | 'closed_won'
  | 'closed_lost';

// ─── Task Types ───────────────────────────────────────────────

export type TaskStatus = 'not_started' | 'in_progress' | 'done' | 'cancelled';
export type TaskCategory = 'revenue' | 'cost' | 'internal' | 'external';
export type TaskType =
  | 'call'
  | 'email'
  | 'meeting'
  | 'document'
  | 'field_visit'
  | 'internal';

// ─── User Roles ───────────────────────────────────────────────

export type UserRole = 'admin' | 'manager' | 'member';
