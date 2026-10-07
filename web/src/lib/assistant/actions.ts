// Hungarian copy is PROPOSAL until Áron approves.
// Assistant v2 abilities (ADR/019 15:00): the model returns ONE constrained JSON action
// proposal, the panel shows it, the user confirms, and only then a server action runs.
import { z } from "zod";
import { VERDICTS } from "@/lib/content/types";
import { REVIEW_REASONS } from "@/lib/content/reasons";
import { CHECK_ANSWER_MAX, CHECK_FOR, CHECK_QUESTION_MAX } from "@/lib/content/service";
import { TicketDraftSchema } from "./ticket";

const text = (max: number, min = 1) => z.string().trim().min(min).max(max);
const id = z.number().int().positive().max(2147483647); // Prisma Int (int32)

export const NAV_PATH_RE = /^\/(?:marketing(?:\/(?:live|campaigns|decisions|\d+))?(?:\?[a-z_]+=[a-z0-9_]+(?:&[a-z_]+=[a-z0-9_]+)*)?|marketing\/decisions#\d+|patchnotes|reports\/weekly)$/;
/** Proposals the browser handles itself (no server action, no confirm). */
export const CLIENT_ACTIONS = ["open_item", "navigate", "waiting"] as const;

export const ActionProposalSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("review"),
    itemId: id,
    verdict: z.enum(VERDICTS),
    comment: text(2000).optional(),
    reason: z.enum(REVIEW_REASONS).optional(),
    /** Pinned by proposeAction (never by the model): the version the user saw when confirming. */
    versionId: id.optional(),
  }).refine((d) => d.verdict === "approve" || (d.comment && d.comment.length >= 3 && d.reason), {
    message: "A javításhoz megjegyzés és ok kell",
  }),
  z.object({ type: z.literal("answer_decision"), checkId: id, answer: text(CHECK_ANSWER_MAX, 2) }),
  z.object({
    type: z.literal("create_decision"),
    question: text(CHECK_QUESTION_MAX, 3),
    context: text(4000),
    options: z.array(text(500)).min(1).max(6),
    recommendation: text(1000).optional(),
    deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    decidedBy: z.enum(CHECK_FOR).default("either"),
  }),
  z.object({ type: z.literal("note"), itemId: id, body: text(4000) }),
  z.object({ type: z.literal("ticket"), draft: TicketDraftSchema }),
  z.object({ type: z.literal("open_item"), itemId: id }),
  z.object({ type: z.literal("navigate"), path: z.string().regex(NAV_PATH_RE) }),
  z.object({ type: z.literal("waiting") }),
  /** The model could not map the request to an action; `message` says why. */
  z.object({ type: z.literal("none"), message: text(1000) }),
]);
export type ActionProposal = z.infer<typeof ActionProposalSchema>;
export type ActionType = Exclude<ActionProposal["type"], "none">;

/** One-line Hungarian description of a proposal for the confirm card and the log. */
export function describeProposal(p: ActionProposal, names: { itemTitle?: string; question?: string } = {}): string {
  switch (p.type) {
    case "review": {
      const v = p.verdict === "approve" ? "Jóváhagyás" : p.verdict === "changes" ? "Javítást kér" : "Újraírást kér";
      return `${v}: #${p.itemId} ${names.itemTitle ?? ""}`.trim();
    }
    case "answer_decision": return `Válasz a kérdésre: ${names.question ?? `#${p.checkId}`}`;
    case "create_decision": return `Új döntés: ${p.question}`;
    case "note": return `Jegyzet: #${p.itemId} ${names.itemTitle ?? ""}`.trim();
    case "ticket": return `Hibajegy: ${p.draft.title}`;
    case "open_item": return `Megnyitom: #${p.itemId} ${names.itemTitle ?? ""}`.trim();
    case "navigate": return `Odaviszem: ${p.path}`;
    case "waiting": return "Megnézem, mi vár Önre";
    case "none": return p.message;
  }
}

/** Body of a decision item: context, options, recommendation, deadline (the item's text). */
export function decisionBody(p: Extract<ActionProposal, { type: "create_decision" }>): string {
  return [
    `## Háttér\n${p.context}`,
    `## Lehetőségek\n${p.options.map((o, i) => `${i + 1}. ${o}`).join("\n")}`,
    ...(p.recommendation ? [`## Javaslat\n${p.recommendation}`] : []),
    ...(p.deadline ? [`## Határidő\n${p.deadline}`] : []),
  ].join("\n\n");
}

// Nullable as anyOf with null: Groq strict mode documents union types, not type arrays.
const nullable = (t: string, extra: Record<string, unknown> = {}) => ({ anyOf: [{ type: t, ...extra }, { type: "null" }] });
const nullEnum = (vals: readonly string[]) => ({ anyOf: [{ type: "string", enum: [...vals] }, { type: "null" }] });
const FLAT_PROPS = {
  type: { type: "string", enum: ["open_item", "navigate", "waiting", "review", "answer_decision", "create_decision", "note", "ticket"] },
  item_id: nullable("integer"),
  check_id: nullable("integer"),
  verdict: nullEnum(VERDICTS),
  reason: nullEnum(REVIEW_REASONS),
  comment: nullable("string"),
  path: nullable("string"),
  text: nullable("string"),
  title: nullable("string"),
  context: nullable("string"),
  options: nullable("array", { items: { type: "string" } }),
  recommendation: nullable("string"),
  deadline: nullable("string"),
  decided_by: nullEnum(CHECK_FOR),
  label: nullEnum(["bug", "backlog"]),
};

/** OpenAI strict schema. Property order matters: read_item_ids first, answer second (streamed).
 * No maxItems: not every strict-mode provider accepts it; the server caps reads at 3 and actions at 3. */
export const MODEL_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["read_item_ids", "answer", "actions"],
  properties: {
    read_item_ids: { type: "array", items: { type: "integer" } },
    answer: { type: "string" },
    actions: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: Object.keys(FLAT_PROPS), properties: FLAT_PROPS },
    },
  },
};

export type FlatAction = {
  type: string;
  item_id: number | null; check_id: number | null;
  verdict: string | null; reason: string | null; comment: string | null;
  path: string | null; text: string | null; title: string | null; context: string | null;
  options: string[] | null; recommendation: string | null; deadline: string | null;
  decided_by: string | null; label: string | null;
};
export type ModelResponse = { read_item_ids: number[]; answer: string; actions: FlatAction[] };

const ModelResponseLoose = z.object({
  read_item_ids: z.array(z.unknown()).default([]).transform((a) => a.filter((n): n is number => Number.isInteger(n))),
  answer: z.string().trim().min(1),
  actions: z.array(z.unknown()).default([]),
});

export function parseModelResponse(raw: string): ModelResponse | null {
  try {
    const t = raw.replace(/```(?:json)?/gi, "");
    const r = ModelResponseLoose.safeParse(JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1)));
    return r.success ? (r.data as ModelResponse) : null;
  } catch {
    return null;
  }
}

const nn = <T,>(v: T | null | undefined) => v ?? undefined;

export function toProposals(flat: unknown[]): { proposals: ActionProposal[]; dropped: number } {
  const proposals: ActionProposal[] = [];
  let dropped = 0;
  for (const f of flat) {
    const a = (f && typeof f === "object" ? f : {}) as Partial<FlatAction>;
    const raw: Record<string, unknown> | null = (() => {
      switch (a.type) {
        case "review": return { type: "review", itemId: nn(a.item_id), verdict: nn(a.verdict), comment: nn(a.comment),
          reason: nn(a.reason) ?? (a.verdict && a.verdict !== "approve" ? "other" : undefined) };
        case "answer_decision": return { type: a.type, checkId: nn(a.check_id), answer: nn(a.text) };
        case "create_decision": return { type: a.type, question: nn(a.title), context: nn(a.context), options: nn(a.options),
          recommendation: nn(a.recommendation), deadline: nn(a.deadline), decidedBy: a.decided_by ?? "either" };
        case "note": return { type: a.type, itemId: nn(a.item_id), body: nn(a.text) };
        case "ticket": return { type: a.type, draft: { title: nn(a.title), body: nn(a.text), label: a.label ?? "backlog", repo: "ndt-crm" } };
        case "open_item": return { type: a.type, itemId: nn(a.item_id) };
        case "navigate": return { type: a.type, path: nn(a.path) };
        case "waiting": return { type: a.type };
        default: return null;
      }
    })();
    const r = raw && ActionProposalSchema.safeParse(raw);
    if (r && r.success) proposals.push(r.data);
    else dropped++;
  }
  return { proposals, dropped };
}
