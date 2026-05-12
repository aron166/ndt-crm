import { db } from "@/lib/db";
import Link from "next/link";
import { PersonsSearch } from "./PersonsSearch";
import { TagFilter } from "@/components/tags/TagFilter";

const PAGE_SIZE = 25;
const TENANT_ID = 1;

interface SearchParams {
  search?: string;
  page?: string;
  tag?: string;
}

function avatarBg(id: number) {
  const palette = [
    "oklch(0.66 0.19 278)", "oklch(0.80 0.13 165)", "oklch(0.80 0.15 75)",
    "oklch(0.78 0.12 230)", "oklch(0.72 0.16 305)", "oklch(0.72 0.18 25)",
  ];
  return palette[id % palette.length];
}

export default async function PersonsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const search = params.search?.trim() ?? "";
  const page = Math.max(1, parseInt(params.page ?? "1", 10));
  const tagName = params.tag?.trim() ?? "";

  let tagFilterIds: number[] | undefined;
  if (tagName) {
    const tag = await db.tag.findFirst({
      where: { tenantId: TENANT_ID, name: { equals: tagName, mode: "insensitive" } },
      include: { taggings: { where: { taggableType: "person" }, select: { taggableId: true } } },
    });
    tagFilterIds = tag?.taggings.map((t) => t.taggableId) ?? [];
  }

  const where = {
    tenantId: TENANT_ID,
    ...(tagFilterIds !== undefined ? { id: { in: tagFilterIds } } : {}),
    ...(search
      ? {
          OR: [
            { firstName: { contains: search, mode: "insensitive" as const } },
            { lastName:  { contains: search, mode: "insensitive" as const } },
            { email:     { contains: search, mode: "insensitive" as const } },
            { phone:     { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [persons, total] = await Promise.all([
    db.person.findMany({
      where,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        contacts: {
          where: { endedAt: null },
          include: { company: { select: { id: true, name: true } } },
          take: 1,
          orderBy: { startedAt: "desc" },
        },
      },
    }),
    db.person.count({ where }),
  ]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="mount">
      {/* Page header */}
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="flex items-center gap-3" style={{ fontSize: 22, fontWeight: 600, color: "var(--fg)", letterSpacing: "-0.02em", margin: 0 }}>
            Személyek
            <span className="font-mono-ndt" style={{ fontSize: 13, color: "var(--fg-mute)", fontWeight: 400 }}>
              · {total.toLocaleString("hu-HU")}
            </span>
          </h1>
          <p style={{ fontSize: 13, color: "var(--fg-mute)", marginTop: 4 }}>
            Személy = entitás. Kapcsolat = állapot. Munkáltatóváltáskor a történet megmarad.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PersonsSearch search={search} />
          <TagFilter activeTagName={tagName || undefined} />
        </div>
      </div>

      {/* Table */}
      <div
        className="rounded-xl overflow-hidden mount mount-1"
        style={{ background: "var(--bg-panel)", border: "1px solid var(--line-soft)" }}
      >
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 13 }}>
          <thead>
            <tr>
              {["", "Név", "Jelenlegi munkahely", "Email", "Telefon"].map((h, i) => (
                <th
                  key={i}
                  style={{
                    textAlign: "left", padding: "10px 16px",
                    fontSize: 10, fontWeight: 600,
                    textTransform: "uppercase", letterSpacing: "0.1em",
                    color: "var(--fg-faint)",
                    borderBottom: "1px solid var(--line-soft)",
                    background: "oklch(0.20 0.014 255 / 0.5)",
                    position: "sticky", top: 0, zIndex: 1,
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {persons.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: "48px 16px", textAlign: "center", color: "var(--fg-faint)" }}>
                  Nincs találat.
                </td>
              </tr>
            )}
            {persons.map((p, idx) => {
              const currentContact = p.contacts[0];
              const initials = [p.firstName?.[0], p.lastName?.[0]].filter(Boolean).join("").toUpperCase() || "?";
              return (
                <tr
                  key={p.id}
                  className="mount"
                  style={{
                    animationDelay: `${idx * 20}ms`,
                    borderBottom: "1px solid var(--line-soft)",
                    transition: "background 0.12s",
                    cursor: "pointer",
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.background = "oklch(0.66 0.19 278 / 0.05)")}
                  onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <td style={{ padding: "10px 16px", width: 48 }}>
                    <Link href={`/persons/${p.id}`}>
                      <div
                        className="font-mono-ndt flex items-center justify-center rounded-full"
                        style={{
                          width: 32, height: 32, fontSize: 11, fontWeight: 600,
                          background: avatarBg(p.id), color: "white",
                        }}
                      >
                        {initials}
                      </div>
                    </Link>
                  </td>
                  <td style={{ padding: "10px 16px" }}>
                    <Link
                      href={`/persons/${p.id}`}
                      style={{ color: "var(--fg)", fontWeight: 500 }}
                      onMouseOver={(e) => (e.currentTarget.style.color = "var(--indigo)")}
                      onMouseOut={(e) => (e.currentTarget.style.color = "var(--fg)")}
                    >
                      {p.lastName} {p.firstName}
                    </Link>
                  </td>
                  <td style={{ padding: "10px 16px" }}>
                    {currentContact ? (
                      <Link
                        href={`/companies/${currentContact.company.id}`}
                        style={{ color: "var(--fg-soft)" }}
                        onMouseOver={(e) => (e.currentTarget.style.color = "var(--indigo)")}
                        onMouseOut={(e) => (e.currentTarget.style.color = "var(--fg-soft)")}
                      >
                        {currentContact.company.name}
                      </Link>
                    ) : (
                      <span style={{ color: "var(--fg-faint)" }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: "10px 16px" }}>
                    {p.email ? (
                      <a href={`mailto:${p.email}`} style={{ color: "var(--fg-mute)", fontFamily: "var(--font-geist-mono)", fontSize: 12 }}
                        onMouseOver={(e) => (e.currentTarget.style.color = "var(--indigo)")}
                        onMouseOut={(e) => (e.currentTarget.style.color = "var(--fg-mute)")}
                      >
                        {p.email}
                      </a>
                    ) : (
                      <span style={{ color: "var(--fg-faint)" }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: "10px 16px" }}>
                    {p.phone ? (
                      <span className="font-mono-ndt" style={{ color: "var(--fg-mute)", fontSize: 12 }}>
                        {p.phone}
                      </span>
                    ) : (
                      <span style={{ color: "var(--fg-faint)" }}>—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 font-mono-ndt" style={{ fontSize: 12, color: "var(--fg-mute)" }}>
          <span>{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} / {total}</span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={`/persons?search=${search}&page=${page - 1}`} className="rounded"
                style={{ padding: "4px 12px", background: "var(--bg-panel)", border: "1px solid var(--line-soft)", color: "var(--fg-soft)" }}>
                ← Előző
              </Link>
            )}
            {page < totalPages && (
              <Link href={`/persons?search=${search}&page=${page + 1}`} className="rounded"
                style={{ padding: "4px 12px", background: "var(--bg-panel)", border: "1px solid var(--line-soft)", color: "var(--fg-soft)" }}>
                Következő →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
