// Hungarian copy is PROPOSAL until Áron approves.
// Assistant v2 abilities (ADR/019 15:00): the model returns ONE constrained JSON action
// proposal, the panel shows it, the user confirms, and only then a server action runs.
import { z } from "zod";
import { VERDICTS } from "@/lib/content/types";
import { REVIEW_REASONS } from "@/lib/content/reasons";
import { CHECK_ANSWER_MAX, CHECK_FOR, CHECK_QUESTION_MAX } from "@/lib/content/service";
import { TicketDraftSchema } from "./ticket";

const text = (max: number, min = 1) => z.string().trim().min(min).max(max);
const id = z.number().int().positive();

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
  /** The model could not map the request to an action; `message` says why. */
  z.object({ type: z.literal("none"), message: text(1000) }),
]);
export type ActionProposal = z.infer<typeof ActionProposalSchema>;
export type ActionType = Exclude<ActionProposal["type"], "none">;

export function parseActionProposal(raw: string): ActionProposal | null {
  try {
    const s = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
    const r = ActionProposalSchema.safeParse(JSON.parse(s));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

export const ACTION_INSTRUCTION = [
  "A felhasználó egy műveletet kér. Ön NEM hajtja végre: csak javaslatot ad, amit a felhasználó a panelen megerősít.",
  "Válaszoljon KIZÁRÓLAG egyetlen JSON objektummal, más szöveg nélkül, az alábbi alakok egyikében:",
  `{"type":"review","itemId":number,"verdict":${VERDICTS.map((v) => `"${v}"`).join("|")},"comment"?:string,"reason"?:${REVIEW_REASONS.map((r) => `"${r}"`).join("|")}}  (anyag bírálata; "approve" kivételével a comment és a reason kötelező)`,
  '{"type":"answer_decision","checkId":number,"answer":string}  (egy döntés vagy tisztázandó kérdés megválaszolása; a checkId a <page> "kérdés #" száma)',
  '{"type":"create_decision","question":string,"context":string,"options":string[],"recommendation"?:string,"deadline"?:"YYYY-MM-DD","decidedBy":"aron"|"peter"|"either"}  (új döntés a Döntések oldalra)',
  '{"type":"note","itemId":number,"body":string}  (jegyzet egy anyaghoz)',
  '{"type":"ticket","draft":{"title":string,"body":string,"label":"bug"|"backlog","repo":"ndt-crm"}}  (hibajegy vagy ötlet)',
  '{"type":"none","message":string}  (ha a kérés nem egyértelmű, vagy az anyag/kérdés nem azonosítható; a message magyarul mondja meg, mi hiányzik)',
  "Az itemId és a checkId CSAK a <page> vagy <item> adatokban szereplő szám lehet. Ne találjon ki azonosítót, inkább adjon \"none\" választ.",
].join("\n");

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
