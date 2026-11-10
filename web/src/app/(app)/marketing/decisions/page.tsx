import { getActor } from "@/lib/actor";
import { getDecisionQueue } from "@/lib/content/queries";
import { getContentReviewers } from "@/lib/content/reviewers";
import { UI } from "@/lib/content/labels";
import { MarketingHeader } from "../MarketingTabs";
import k from "@/components/astryx/page.module.css";
import s from "../marketing.module.css";
import { DecisionsClient } from "./DecisionsClient";
import { RefreshOnFocus } from "@/components/RefreshOnFocus";

const TENANT_ID = 1;

export const dynamic = "force-dynamic";

export default async function DecisionsPage() {
  const { userId } = await getActor(TENANT_ID);
  // setCheckState requires a reviewer, so a non-reviewer must not see the
  // answer box — every submit would 403 (Vanda F5).
  const reviewers = userId == null ? [] : await getContentReviewers(TENANT_ID);

  if (userId == null || !reviewers.includes(userId)) {
    return (
      <div className="mount">
        <MarketingHeader active="decisions" title={UI.decisionsTitle} help={UI.decisionsLead} />
        <div className={`${k.empty} ${s.emptyC}`}>{UI.notReviewer}</div>
      </div>
    );
  }

  const queue = await getDecisionQueue(TENANT_ID);

  return (
    <div className="mount">
      <RefreshOnFocus />
      <MarketingHeader active="decisions" title={UI.decisionsTitle} help={UI.decisionsLead} />
      <DecisionsClient queue={queue} />
    </div>
  );
}
