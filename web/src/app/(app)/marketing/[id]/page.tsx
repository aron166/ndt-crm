import { notFound } from "next/navigation";
import Link from "next/link";
import { getActor } from "@/lib/actor";
import { getReviewPage } from "@/lib/content/queries";
import { signedViewUrls } from "@/lib/content/storage";
import { ReviewClient } from "./ReviewClient";

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
  const signedUrls = await signedViewUrls(paths);

  // No `mount` animation here: its transform would break the fixed phone action bar.
  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Link
          href="/marketing"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, color: "var(--fg-mute)" }}
          className="row-link"
        >
          ← Anyagok
        </Link>
      </div>

      <ReviewClient key={data.item.currentVersionId ?? "none"} data={data} userId={userId} signedUrls={signedUrls} />
    </div>
  );
}
