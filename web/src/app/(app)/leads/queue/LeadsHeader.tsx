import Link from "next/link";
import s from "./queue.module.css";

export type LeadsViewName = "queue" | "board" | "closed";

// PROPOSAL copy
const VIEWS: { key: LeadsViewName; label: string; href: string }[] = [
  { key: "board", label: "Tábla", href: "/leads" },
  { key: "queue", label: "Hívólista", href: "/leads?view=queue" },
  { key: "closed", label: "Lezárt", href: "/leads?view=closed" },
];

export function LeadsHeader({
  view, title, help, openCount, queueCount, closedCount, owner, ownerHref, now = new Date(), actions,
}: {
  view: LeadsViewName;
  title: string;
  help?: string;
  openCount: number;
  queueCount: number;
  closedCount: number;
  owner?: { current: string; users: { id: number; name: string }[] };
  now?: Date;
  actions?: React.ReactNode;
  ownerHref?: (key: string) => string;
}) {
  // PROPOSAL copy
  const dateLine = new Intl.DateTimeFormat("hu-HU", {
    timeZone: "Europe/Budapest", weekday: "long", year: "numeric", month: "long", day: "numeric",
  }).format(now);
  const counts: Record<LeadsViewName, number | null> = { queue: queueCount, board: openCount, closed: closedCount };
  const ownerLinks = owner && [
    { key: "me", label: "Enyém" }, // PROPOSAL copy
    { key: "all", label: "Mindenki" },
    ...owner.users.map((u) => ({ key: String(u.id), label: u.name })),
  ];
  return (
    <header className={s.header}>
      <div className={s.headRow}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className={s.date}>{dateLine}</span>
          <h1 className={s.title}>{title}</h1>
          {help && <p className={s.help}>{help}</p>}
        </div>
        <nav className={s.seg} aria-label="Nézet">
          {VIEWS.map((v) => (
            <Link
              key={v.key}
              href={v.href}
              aria-current={v.key === view ? "page" : undefined}
              className={`${s.segItem} ${v.key === view ? s.segItemOn : ""}`}
            >
              {v.label} · {counts[v.key]}
            </Link>
          ))}
        </nav>
      </div>
      {(ownerLinks || actions) && (
        <div className={s.headRow}>
          {ownerLinks && owner ? (
            <nav className={s.seg} aria-label="Kinek a listája">
              {ownerLinks.map((o) => (
                <Link
                  key={o.key}
                  href={ownerHref ? ownerHref(o.key) : `/leads?owner=${o.key}`}
                  aria-current={o.key === owner.current ? "true" : undefined}
                  className={`${s.segItem} ${o.key === owner.current ? s.segItemOn : ""}`}
                >
                  {o.label}
                </Link>
              ))}
            </nav>
          ) : <span />}
          {actions}
        </div>
      )}
    </header>
  );
}
