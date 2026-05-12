import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PersonDetailClient } from "./PersonDetailClient";
import { getTagsForEntity } from "@/app/actions/tags";
import { getEntityHistory } from "@/app/actions/audit";
import { serializeDates } from "@/lib/serialize";

const TENANT_ID = 1;

const AVATAR_PALETTE = [
  "oklch(0.66 0.19 278)", "oklch(0.80 0.13 165)", "oklch(0.80 0.15 75)",
  "oklch(0.78 0.12 230)", "oklch(0.72 0.16 305)", "oklch(0.72 0.18 25)",
];

export default async function PersonDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const personId = parseInt(id, 10);
  if (isNaN(personId)) notFound();

  const [person, contacts, interactions, tasks, conversations, initialTags, auditEntries] = await Promise.all([
    db.person.findFirst({ where: { id: personId, tenantId: TENANT_ID } }),
    db.contact.findMany({
      where: { personId, tenantId: TENANT_ID },
      include: { company: true },
      orderBy: [{ endedAt: "asc" }, { startedAt: "desc" }],
    }),
    db.interaction.findMany({
      where: { personId, tenantId: TENANT_ID },
      orderBy: { occurredAt: "desc" },
      take: 50,
    }),
    db.task.findMany({
      where: { personId, tenantId: TENANT_ID, parentTaskId: null },
      include: { _count: { select: { subTasks: true } } },
      orderBy: [{ status: "asc" }, { dueDate: "asc" }],
    }),
    db.conversation.findMany({
      where: { personId, tenantId: TENANT_ID },
      include: {
        agent: { select: { id: true, name: true, role: true, owner: true } },
        messages: { orderBy: { createdAt: "asc" } },
      },
      orderBy: { startedAt: "desc" },
      take: 20,
    }),
    getTagsForEntity("person", personId),
    getEntityHistory("person", personId),
  ]);

  if (!person) notFound();

  // Engagement sparkline — interaction count per 2-week bucket, last 24 buckets
  const now = Date.now();
  const buckets = Array.from({ length: 24 }, (_, i) => {
    const bucketEnd = now - i * 14 * 24 * 3600 * 1000;
    const bucketStart = bucketEnd - 14 * 24 * 3600 * 1000;
    return interactions.filter((x) => {
      const t = new Date(x.occurredAt).getTime();
      return t >= bucketStart && t < bucketEnd;
    }).length;
  }).reverse();
  // Smooth with a floor so the line is never flat zero
  const engagementSeries = buckets;

  // Signal level based on recent interaction frequency
  const last30 = interactions.filter((x) => now - new Date(x.occurredAt).getTime() < 30 * 24 * 3600 * 1000).length;
  const last90 = interactions.filter((x) => now - new Date(x.occurredAt).getTime() < 90 * 24 * 3600 * 1000).length;
  const signalLevel = last30 >= 3 ? 6 : last30 >= 2 ? 5 : last30 >= 1 ? 4 : last90 >= 2 ? 3 : last90 >= 1 ? 2 : 1;

  const avatarColor = AVATAR_PALETTE[personId % AVATAR_PALETTE.length];
  const initials = [person.firstName?.[0], person.lastName?.[0]].filter(Boolean).join("").toUpperCase() || "?";

  return (
    <div className="mount">
      <div style={{ marginBottom: 16 }}>
        <Link
          href="/persons"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--fg-mute)" }}
          className="row-link"
        >
          <ArrowLeft style={{ width: 14, height: 14 }} />
          Vissza a személyekhez
        </Link>
      </div>

      <PersonDetailClient
        person={serializeDates(person)}
        contacts={serializeDates(contacts)}
        interactions={serializeDates(interactions)}
        tasks={serializeDates(tasks)}
        conversations={serializeDates(conversations)}
        engagementSeries={engagementSeries}
        signalLevel={signalLevel}
        avatarColor={avatarColor}
        initials={initials}
        initialTags={initialTags}
        auditEntries={serializeDates(auditEntries)}
      />
    </div>
  );
}
