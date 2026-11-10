import { db } from "@/lib/db";
import Link from "next/link";
import { PersonsSearch } from "./PersonsSearch";
import { CreatePersonButton } from "@/components/CreatePersonButton";
import { TagFilter } from "@/components/tags/TagFilter";
import { SavedViewsDropdown } from "@/components/SavedViewsDropdown";
import { getSavedViews } from "@/app/actions/saved-views";
import { employerState } from "@/lib/persons/employer";
import { PageHeader } from "@/components/astryx/PageHeader";
import k from "@/components/astryx/page.module.css";
import s from "./persons.module.css";

const PAGE_SIZE = 30;
const TENANT_ID = 1;

function avatarBg(id: number) {
  const palette = [
    "var(--ui-accent)", "var(--mint)", "var(--amber)",
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
    <div>
      <PageHeader
        title="Személyek"
        eyebrow={`${total.toLocaleString("hu-HU")} személy`} /* PROPOSAL copy */
        actions={<CreatePersonButton />}
        filters={
          <>
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
          </>
        }
      />

      {/* Table */}
      <div className={k.tableWrap}>
        <table className={k.table}>
          <thead>
            <tr>
              {["", "Személy", "Munkahely", "Telefon"].map((h, i) => (
                <th key={i}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {persons.length === 0 && (
              <tr>
                <td colSpan={4}>
                  <div className={k.empty} style={{ alignItems: "center" }}>
                    <span>Nincs találat</span>
                    {search && <Link href="/persons" className={k.link}>Szűrő törlése</Link>}
                  </div>
                </td>
              </tr>
            )}
            {persons.map((p) => {
              const state = employerState(p.contacts);
              const initials = [p.lastName?.[0], p.firstName?.[0]].filter(Boolean).join("").toUpperCase() || "?";
              return (
                <tr key={p.id} className={s.row}>
                  {/* Avatar */}
                  <td>
                    <Link href={`/persons/${p.id}`} tabIndex={-1} aria-hidden="true">
                      <div className={s.avatar} style={{ background: avatarBg(p.id) }}>
                        {initials}
                      </div>
                    </Link>
                  </td>

                  {/* Name + role */}
                  <td>
                    <span className={k.nameLine}>
                      <Link href={`/persons/${p.id}`} className={s.name}>
                        {p.lastName} {p.firstName}
                      </Link>
                      {state.kind === "current" && state.role && (
                        <span className={k.muted}>{state.role}</span>
                      )}
                    </span>
                  </td>

                  {/* Current company */}
                  <td>
                    {state.kind === "current" && (
                      <Link href={`/companies/${state.companyId}`} className={s.secLink}>
                        {state.companyName}
                      </Link>
                    )}
                    {state.kind === "former" && (
                      <span className={k.muted}>
                        Volt: <Link href={`/companies/${state.companyId}`} className={s.secLink}>{state.companyName}</Link>
                      </span>
                    )}
                    {state.kind === "unknown" && (
                      <span className={k.muted}>Munkahely ismeretlen</span>
                    )}
                  </td>

                  {/* Phone — clickable */}
                  <td className={s.nowrap}>
                    {p.phone ? (
                      <a href={`tel:${p.phone}`} className={s.secLink}>
                        {p.phone}
                      </a>
                    ) : (
                      <span className={k.muted}>-</span>
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
        <div className={k.pager}>
          <span className={`${k.muted} ${k.num}`}>{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} / {total.toLocaleString("hu-HU")}</span>
          <div style={{ display: "flex", gap: 8 }}>
            {page > 1 && (
              <Link href={`/persons?search=${search}&page=${page - 1}`} className={k.btn}>
                ← Előző
              </Link>
            )}
            {page < totalPages && (
              <Link href={`/persons?search=${search}&page=${page + 1}`} className={k.btn}>
                Következő →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
