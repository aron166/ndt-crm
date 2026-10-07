import "server-only";
import { db } from "@/lib/db";
import { describeProposal, type ActionProposal } from "./actions";
import type { ActionCard } from "./chat-types";

/**
 * Turns validated model proposals into confirm cards: every id is resolved against the
 * tenant (unknown ids are dropped, never shown), a review is pinned to the current version
 * the user will confirm, and the card summary names the real title or question.
 * Two queries at most, whatever the number of actions.
 */
export async function enrichProposals(tenantId: number, proposals: ActionProposal[]): Promise<ActionCard[]> {
  const itemIds = proposals.flatMap((p) => (p.type === "review" || p.type === "note" || p.type === "open_item" ? [p.itemId] : []));
  const checkIds = proposals.flatMap((p) => (p.type === "answer_decision" ? [p.checkId] : []));
  const [items, checks] = await Promise.all([
    itemIds.length ? db.contentItem.findMany({ where: { tenantId, id: { in: itemIds } }, select: { id: true, title: true, currentVersionId: true } }) : [],
    checkIds.length ? db.contentCheck.findMany({ where: { tenantId, id: { in: checkIds }, state: "open" }, select: { id: true, question: true } }) : [],
  ]);
  const cards: ActionCard[] = [];
  proposals.forEach((p, i) => {
    let names: { itemTitle?: string; question?: string } = {};
    let proposal: ActionProposal = p;
    if (p.type === "review" || p.type === "note" || p.type === "open_item") {
      const it = items.find((x) => x.id === p.itemId);
      if (!it) return;
      names = { itemTitle: it.title };
      if (p.type === "review") {
        if (it.currentVersionId == null) return;
        proposal = { ...p, versionId: it.currentVersionId };
      }
    } else if (p.type === "answer_decision") {
      const c = checks.find((x) => x.id === p.checkId);
      if (!c) return;
      names = { question: c.question };
    } else if (p.type === "none") {
      return;
    }
    cards.push({ key: `${i}-${p.type}`, summary: describeProposal(proposal, names), proposal });
  });
  return cards;
}
