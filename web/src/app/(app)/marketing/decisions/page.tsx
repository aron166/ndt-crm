import { getActor } from "@/lib/actor";
import { getDecisionQueue } from "@/lib/content/queries";
import { getContentReviewers } from "@/lib/content/reviewers";
import { UI } from "@/lib/content/labels";
import { MarketingTabs } from "../MarketingTabs";
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
        <MarketingTabs active="decisions" />
        <div className="panel">
          <div className="panel-pad" style={{ textAlign: "center", color: "var(--fg-mute)", fontSize: 14 }}>
            {UI.notReviewer}
          </div>
        </div>
      </div>
    );
  }

  const queue = await getDecisionQueue(TENANT_ID);

  return (
    <div className="mount">
      <RefreshOnFocus />
      <MarketingTabs active="decisions" />
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, color: "var(--fg)", marginBottom: 4 }}>{UI.decisionsTitle}</h1>
        <p style={{ fontSize: 13, color: "var(--fg-mute)" }}>{UI.decisionsLead}</p>
      </div>
      <DecisionsClient queue={queue} />
    </div>
  );
}
