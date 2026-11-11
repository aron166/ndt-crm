import Link from "next/link";
import s from "./page.module.css";

export type SegLink = { key: string; label: string; href: string };

/** Segmented link control for views and filters (server-safe, URL is the state). */
export function Seg({ items, current, label }: { items: SegLink[]; current: string; label: string }) {
  return (
    <nav className={s.seg} aria-label={label}>
      {items.map((it) => (
        <Link
          key={it.key}
          href={it.href}
          aria-current={it.key === current ? "page" : undefined}
          className={`${s.segItem} ${it.key === current ? s.segItemOn : ""}`}
        >
          {it.label}
        </Link>
      ))}
    </nav>
  );
}

/** Page header from the leads home: eyebrow, big title, help line, views on the right, filters and actions below. */
export function PageHeader({
  title, eyebrow, help, views, actions, filters,
}: {
  title: React.ReactNode;
  eyebrow?: React.ReactNode;
  help?: React.ReactNode;
  /** Right of the title: usually a <Seg> of views. */
  views?: React.ReactNode;
  /** Primary buttons (new item etc.). */
  actions?: React.ReactNode;
  /** Second row, left: <Seg> filters, search. */
  filters?: React.ReactNode;
}) {
  return (
    <header className={s.header}>
      <div className={s.headRow}>
        <div className={s.headText}>
          {eyebrow && <span className={s.eyebrow}>{eyebrow}</span>}
          <h1 className={s.title}>{title}</h1>
          {help && <p className={s.help}>{help}</p>}
        </div>
        {(views || (actions && !filters)) && (
          <div className={s.actions}>
            {views}
            {!filters && actions}
          </div>
        )}
      </div>
      {filters && (
        <div className={s.headRow}>
          <div className={s.filters}>{filters}</div>
          {actions && <div className={s.actions}>{actions}</div>}
        </div>
      )}
    </header>
  );
}
