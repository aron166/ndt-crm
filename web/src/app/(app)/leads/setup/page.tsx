import { db } from "@/lib/db";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { LeadStatusSetupClient } from "./LeadStatusSetupClient";
import { QualificationQuestionsClient } from "./QualificationQuestionsClient";
import { ScriptVariantsClient } from "./ScriptVariantsClient";
import { TechnologyWordsClient } from "./TechnologyWordsClient";
import { getQuestionModel, getRawScriptVariants } from "@/lib/leads/queries";
import { getIntroMaterialUrl } from "@/lib/leads/intro";
import { getScriptStats } from "@/lib/leads/script-stats";
import { getTechnologyWordCounts } from "@/lib/leads/technology-words";
import { PageHeader } from "@/components/astryx/PageHeader";
import k from "@/components/astryx/page.module.css";

const TENANT_ID = 1;

export default async function LeadStatusSetupPage() {
  const [statuses, questionModel, introUrl, scriptVariants] = await Promise.all([
    db.leadStatus.findMany({
      where: { tenantId: TENANT_ID },
      orderBy: { position: "asc" },
    }),
    getQuestionModel(TENANT_ID),
    getIntroMaterialUrl(TENANT_ID),
    // RAW (unresolved) variants — this page edits stored scripts, not the
    // live-resolved ones (that would overwrite a linked variant's stored body
    // with an empty fallback the moment its content item goes missing).
    getRawScriptVariants(TENANT_ID),
  ]);
  // Stats only key off `key`, so the raw list is fine here too — no need for
  // the live-resolved bodies just to look up call outcomes.
  const scriptStats = await getScriptStats(TENANT_ID, scriptVariants);
  const technologyWords = await getTechnologyWordCounts(TENANT_ID);

  return (
    <div className="mount">
      <Link href="/leads?view=board" className={k.back}>
        <ArrowLeft style={{ width: 14, height: 14 }} />
        Vissza a leadekhez
      </Link>

      <PageHeader
        title="Lead státuszok"
        help="A lead pipeline oszlopai. Húzd át az átrendezéshez; jelöld ki a kezdő oszlopot, ahová a beérkező leadek kerülnek."
      />

      <LeadStatusSetupClient statuses={statuses} />
      <QualificationQuestionsClient questions={questionModel.questions} sets={questionModel.sets} introUrl={introUrl} />
      <ScriptVariantsClient variants={scriptVariants} stats={scriptStats} />
      <TechnologyWordsClient words={technologyWords} />
    </div>
  );
}
