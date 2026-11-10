import { interactionTypeLabel, interactionDirectionLabel } from "@/lib/interactions";
import { callOutcomeLabel } from "./outcomes";
import { DOCUMENT_TITLE, type DocumentKind } from "@/lib/documents/document";

// One history for the lead page: pure merge of everything dated, newest first.

type D = string | Date;
export type TimelineKind = "call" | "email" | "note" | "stage" | "booking" | "task" | "offer" | "document" | "form";

export interface TimelineItem {
  id: string;
  at: string;
  kind: TimelineKind;
  title: string;
  meta?: string;
  body?: string;
}

export interface TimelineInput {
  interactions: { id: number; type: string | null; direction: string | null; outcome: string | null; notes: string | null; occurredAt: D; user?: { name: string } | null }[];
  auditEntries: { id: number; occurredAt: D; changes: unknown }[];
  statusHistory: { id: number; fromStatus: string | null; toStatus: string; event: string; at: D; actorUser?: { name: string } | null }[];
  tasks: { id: number; title: string; type: string | null; status: string; dueDate: D | null }[];
  offers: { id: number; quoteNumber: string; status: string; createdAt: D; sentAt: D | null; acceptedAt: D | null }[];
  documents: { id: number; kind: string; number: string; createdAt: D }[];
  lead: { message: string | null; receivedDate: D | null; createdAt: D };
  /** Live stage labels (key -> label); a missing key shows the raw key. */
  stageLabels?: Record<string, string>;
}

const ms = (d: D) => new Date(d).getTime();
const iso = (d: D) => new Date(d).toISOString();
// Audit is written just after the status-history row in the same request.
const SAME_MOVE_MS = 60_000;

function stageTitle(from: string | null, to: string, labels: Record<string, string>): string {
  const l = (k: string) => labels[k] ?? k;
  return from ? `Szakasz: ${l(from)} → ${l(to)}` : `Szakasz: ${l(to)}`; // PROPOSAL copy
}

function auditStage(changes: unknown): { from: string | null; to: string } | null {
  const c = changes as { before?: { status?: unknown }; after?: { status?: unknown } } | null;
  const to = c?.after?.status;
  if (typeof to !== "string") return null;
  const from = typeof c?.before?.status === "string" ? c.before.status : null;
  return from === to ? null : { from, to };
}

export function buildTimeline(input: TimelineInput): TimelineItem[] {
  const labels = input.stageLabels ?? {};
  const items: TimelineItem[] = [];

  for (const r of input.interactions) {
    const kind: TimelineKind = r.type === "call" ? "call" : r.type === "email" ? "email" : "note";
    const dir = interactionDirectionLabel(r.direction);
    const title = [interactionTypeLabel(r.type), r.outcome && kind === "call" ? callOutcomeLabel(r.outcome) : null].filter(Boolean).join(": ");
    items.push({ id: `i-${r.id}`, at: iso(r.occurredAt), kind, title, meta: [dir, r.user?.name].filter(Boolean).join(" · ") || undefined, body: r.notes?.trim() || undefined });
  }

  for (const h of input.statusHistory) {
    items.push({ id: `h-${h.id}`, at: iso(h.at), kind: "stage", title: stageTitle(h.fromStatus, h.toStatus, labels), meta: h.actorUser?.name });
  }
  for (const a of input.auditEntries) {
    const st = auditStage(a.changes);
    if (!st) continue;
    const dup = input.statusHistory.some((h) => h.toStatus === st.to && Math.abs(ms(h.at) - ms(a.occurredAt)) <= SAME_MOVE_MS);
    if (!dup) items.push({ id: `a-${a.id}`, at: iso(a.occurredAt), kind: "stage", title: stageTitle(st.from, st.to, labels) });
  }

  for (const t of input.tasks) {
    if (!t.dueDate) continue;
    const open = t.status === "created" || t.status === "in_progress";
    const booking = t.type === "meeting";
    if (!open && !booking) continue;
    items.push({ id: `t-${t.id}`, at: iso(t.dueDate), kind: booking ? "booking" : "task", title: t.title });
  }

  for (const o of input.offers) {
    const state = o.acceptedAt ? "elfogadva" : o.sentAt ? "elküldve" : "elkészült"; // PROPOSAL copy
    items.push({ id: `o-${o.id}`, at: iso(o.acceptedAt ?? o.sentAt ?? o.createdAt), kind: "offer", title: `Ajánlat ${state}: ${o.quoteNumber}` });
  }
  for (const d of input.documents) {
    items.push({ id: `d-${d.id}`, at: iso(d.createdAt), kind: "document", title: `${DOCUMENT_TITLE[d.kind as DocumentKind] ?? d.kind}: ${d.number}` });
  }

  items.sort((x, y) => ms(y.at) - ms(x.at));
  // The form is where the lead began: always the bottom row.
  items.push({ id: "form", at: iso(input.lead.receivedDate ?? input.lead.createdAt), kind: "form", title: "Érdeklődés beérkezett", body: input.lead.message?.trim() || undefined }); // PROPOSAL copy
  return items;
}
