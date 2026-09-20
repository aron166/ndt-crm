import { db } from "@/lib/db";
import Link from "next/link";
import { PersonsSearch } from "./PersonsSearch";
import { CreatePersonButton } from "@/components/CreatePersonButton";
import { TagFilter } from "@/components/tags/TagFilter";
import { SavedViewsDropdown } from "@/components/SavedViewsDropdown";
import { getSavedViews } from "@/app/actions/saved-views";
import { employerState } from "@/lib/persons/employer";

const PAGE_SIZE = 30;
const TENANT_ID = 1;

function avatarBg(id: number) {
  const palette = [
    "var(--indigo)", "var(--mint)", "var(--amber)",
    "var(--sky)", "var(--violet)", "var(--coral)",
  ];
  return palette[id % palette.length];
}

interface SearchParams {
  search?: string;
  page?: string;
  tag?: string;
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
    deletedAt: null,
    ...(tagFilterIds !== undefined ? { id: { in: tagFilterIds } } : {}),
    ...(search
      ? {
          OR: [
            { firstName: { contains: search, mode: "insensitive" as const } },
            { lastName:  { contains: search, mode: "insensitive" as const } },
            { email:     { contains: search, mode: "insensitive" as const } },
            { phone:     { contains: search, mode: "insensitive" as const } },
            // Find the person by the company they work at, or used to.
            { contacts: { some: { company: { name: { contains: search, mode: "insensitive" as const } } } } },
          ],
        }
      : {}),
  };

  const [persons, total, savedViews] = await Promise.all([
    db.person.findMany({
      where,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        contacts: {
          // Not scoped to the open contact any more: we need the whole history
          // to tell "left, unknown employer" apart from "never had one" (see
          // employerState). take: 20 + this orderBy bound it - a person has a
          // handful of jobs, not hundreds.
          include: { company: { select: { id: true, name: true } } },
          take: 20,
          // nulls "first" is load-bearing, not cosmetic: `endedAt: "asc"` alone puts
          // NULLs (the OPEN contact) LAST in Postgres, so a person with more than
          // `take` rows would have their current employer cut off and read as
          // "former". Open contacts first, then most recently ended.
          orderBy: [{ endedAt: { sort: "desc", nulls: "first" } }, { startedAt: "desc" }],
        },
      },
    }),
    db.person.count({ where }),
    getSavedViews("person"),
  ]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="mount">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 mb-5">
        <div className="flex items-center gap-3">
          <h1 style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.02em", margin: 0, color: "var(--fg)", display: "flex", alignItems: "baseline", gap: 8 }}>
            Személyek
            <span className="font-mono-ndt" style={{ fontSize: 14, color: "var(--fg-faint)", fontWeight: 400 }}>
              {total.toLocaleString("hu-HU")}
            </span>
          </h1>
          <CreatePersonButton />
        </div>
        <div className="flex items-center gap-2">
          <PersonsSearch search={search} />
          <TagFilter activeTagName={tagName || undefined} />
          <SavedViewsDropdown
            entityType="person"
            basePath="/persons"
            currentParams={{
              ...(search   ? { search }        : {}),
              ...(tagName  ? { tag: tagName }  : {}),
            }}
            views={savedViews}
          />
        </div>
      </div>

      {/* Table */}
      <table className="mount mount-1" style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead>
          <tr>
            {["", "Személy", "Munkahely", "Telefon"].map((h, i) => (
              <th
                key={i}
                style={{
                  textAlign: "left",
                  padding: "0 14px 8px",
                  fontSize: 12, fontWeight: 600,
                  textTransform: "uppercase", letterSpacing: "0.12em",
                  color: "var(--fg-faint)",
                  borderBottom: "1px solid var(--line-soft)",
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
              <td colSpan={4} style={{ padding: "56px 14px", textAlign: "center" }}>
                <div style={{ color: "var(--fg-faint)", fontSize: 14 }}>Nincs találat</div>
                {search && (
                  <div style={{ marginTop: 6, fontSize: 14 }}>
                    <Link href="/persons" style={{ color: "var(--indigo)" }}>Szűrő törlése</Link>
                  </div>
                )}
              </td>
            </tr>
          )}
          {persons.map((p, idx) => {
            const state = employerState(p.contacts);
            const initials = [p.lastName?.[0], p.firstName?.[0]].filter(Boolean).join("").toUpperCase() || "?";
            return (
              <tr
                key={p.id}
                className="tbl-row mount"
                style={{ animationDelay: `${Math.min(idx * 15, 300)}ms` }}
              >
                {/* Avatar */}
                <td style={{ padding: "7px 14px", width: 40, borderBottom: "1px solid var(--line-soft)" }}>
                  <Link href={`/persons/${p.id}`}>
                    <div
                      className="font-mono-ndt flex items-center justify-center"
                      style={{
                        width: 28, height: 28, borderRadius: "50%",
                        fontSize: 12, fontWeight: 700,
                        background: avatarBg(p.id), color: "var(--fg-on-accent)",
                      }}
                    >
                      {initials}
                    </div>
                  </Link>
                </td>

                {/* Name + role */}
                <td style={{ padding: "7px 14px", borderBottom: "1px solid var(--line-soft)" }}>
                  <Link href={`/persons/${p.id}`} className="tbl-link" style={{ fontSize: 14 }}>
                    {p.lastName} {p.firstName}
                  </Link>
                  {state.kind === "current" && state.role && (
                    <span style={{ fontSize: 12, color: "var(--fg-faint)", marginLeft: 8 }}>
                      {state.role}
                    </span>
                  )}
                </td>

                {/* Current company */}
                <td style={{ padding: "7px 14px", borderBottom: "1px solid var(--line-soft)" }}>
                  {state.kind === "current" && (
                    <Link href={`/companies/${state.companyId}`} className="tbl-link-muted" style={{ fontSize: 14 }}>
                      {state.companyName}
                    </Link>
                  )}
                  {state.kind === "former" && (
                    <span style={{ fontSize: 14, color: "var(--fg-mute)" }}>
                      Volt: <Link href={`/companies/${state.companyId}`} className="tbl-link-muted">{state.companyName}</Link>
                    </span>
                  )}
                  {state.kind === "unknown" && (
                    <span style={{ color: "var(--fg-faint)", fontSize: 14 }}>Munkahely ismeretlen</span>
                  )}
                </td>

                {/* Phone — clickable */}
                <td style={{ padding: "7px 14px", borderBottom: "1px solid var(--line-soft)" }}>
                  {p.phone ? (
                    <a
                      href={`tel:${p.phone}`}
                      className="font-mono-ndt tbl-link-faint"
                      style={{ fontSize: 14 }}
                    >
                      {p.phone}
                    </a>
                  ) : (
                    <span style={{ color: "var(--fg-faint)", fontSize: 14 }}>-</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 font-mono-ndt" style={{ fontSize: 12, color: "var(--fg-faint)" }}>
          <span>{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} / {total.toLocaleString("hu-HU")}</span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={`/persons?search=${search}&page=${page - 1}`}
                style={{ padding: "4px 10px", background: "var(--bg-panel)", border: "1px solid var(--line-soft)", borderRadius: 5, color: "var(--fg-soft)", fontSize: 12 }}
              >
                ← Előző
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={`/persons?search=${search}&page=${page + 1}`}
                style={{ padding: "4px 10px", background: "var(--bg-panel)", border: "1px solid var(--line-soft)", borderRadius: 5, color: "var(--fg-soft)", fontSize: 12 }}
              >
                Következő →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
