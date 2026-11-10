import { notFound } from "next/navigation";
import Link from "next/link";
import k from "@/components/astryx/page.module.css";
import { getActor } from "@/lib/actor";
import { getReviewPage } from "@/lib/content/queries";
import { signedViewUrls } from "@/lib/content/storage";
import { listOutreachCampaignKeys } from "@/app/actions/content";
import { ReviewClient } from "./ReviewClient";
import { RefreshOnFocus } from "@/components/RefreshOnFocus";

const TENANT_ID = 1;

export const dynamic = "force-dynamic";

export default async function ContentReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const itemId = parseInt(id, 10);

  const { userId } = await getActor(TENANT_ID);
  const data = await getReviewPage(TENANT_ID, itemId, userId ?? -1);
  if (!data) notFound();

  const paths = data.versions.flatMap((v) =>
    v.assets.map((a) => a.storagePath).filter((p): p is string => Boolean(p))
  );
  // Only email content ever gets a campaign slot: skip the extra query otherwise.
  const [signedUrls, outreachCampaigns] = await Promise.all([
    signedViewUrls(paths),
    data.item.category === "email" ? listOutreachCampaignKeys() : Promise.resolve([]),
  ]);

  // No `mount` animation here: its transform would break the fixed phone action bar.
  return (
    <div>
      <RefreshOnFocus />
      <Link href="/marketing" className={k.back}>
        ← Anyagok
      </Link>

      <ReviewClient
        key={data.item.currentVersionId ?? "none"}
        data={data}
        userId={userId}
        signedUrls={signedUrls}
        outreachCampaigns={outreachCampaigns}
      />
    </div>
  );
}
