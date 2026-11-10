"use client";

import Link from "next/link";
import { Mail, MoreHorizontal, Phone } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { TIER_LABEL, isTier } from "@/lib/leads/tier";
import s from "./lead2.module.css";

const telOf = (phone: string | null) => (phone ? `tel:${phone.replace(/[^\d+]/g, "")}` : null);

// tel: dials on a phone; a desktop browser only switches to calling mode.
function CallLink({ tel, onCall, outline }: { tel: string | null; onCall: () => void; outline: boolean }) {
  const cls = `${s.callBtn} ${outline ? s.callOutline : ""}`;
  const inner = <><Phone size={20} />{/* PROPOSAL copy */}Hívás</>;
  if (!tel) return <button type="button" className={cls} onClick={onCall}>{inner}</button>;
  return (
    <a
      href={tel}
      className={cls}
      onClick={(e) => {
        if (!window.matchMedia("(pointer: coarse)").matches) e.preventDefault();
        onCall();
      }}
    >
      {inner}
    </a>
  );
}

/** Phone only: sticky full-width call bar, rendered last in the page so sticky bottom holds. */
export function CallBar({ phone, onCall, outline }: { phone: string | null; onCall: () => void; outline: boolean }) {
  return <div className={s.callBar}><CallLink tel={telOf(phone)} onCall={onCall} outline={outline} /></div>;
}

export function Header(p: {
  name: string;
  companyId: number | null;
  contactName: string | null;
  personHref: string | null;
  role: string | null;
  town: string | null;
  phone: string | null;
  email: string | null;
  stageLabel: string;
  tier: string | null;
  ownerName: string | null;
  calling: boolean;
  callOutline: boolean;
  canMove: boolean;
  canClose: boolean;
  deleting: boolean;
  onCall: () => void;
  onEdit: () => void;
  onOwner: () => void;
  onStage: () => void;
  onClose: () => void;
  onDelete: () => void;
}) {
  const contact = p.contactName && p.personHref ? <Link href={p.personHref}>{p.contactName}</Link> : p.contactName;
  const subParts = [contact, p.role, p.town].filter(Boolean);
  const tel = telOf(p.phone);
  return (
    <div className={s.head}>
      <div className={s.who}>
        <div className={s.chips}>
          <span className={s.chip}>{p.stageLabel}</span>
          {isTier(p.tier) && <span className={s.chip}>{`${p.tier} · ${TIER_LABEL[p.tier]}`}</span>}
          {/* PROPOSAL copy */}
          <span className={s.chip}>{`Felelős: ${p.ownerName ?? "nincs"}`}</span>
          <span className={s.menu}>
      <DropdownMenu>
        <DropdownMenuTrigger className={buttonVariants({ variant: "outline", size: "icon" })} aria-label="Lead actions" /* PROPOSAL copy: own name, the nav already has Továbbiak */>
          <MoreHorizontal size={18} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {/* PROPOSAL copy: menu items */}
          <DropdownMenuItem onClick={p.onEdit}>Szerkesztés</DropdownMenuItem>
          <DropdownMenuItem onClick={p.onOwner}>Felelős módosítása</DropdownMenuItem>
          {p.canMove && <DropdownMenuItem onClick={p.onStage}>Szakasz váltása</DropdownMenuItem>}
          {p.canClose && <DropdownMenuItem onClick={p.onClose}>Lezárás</DropdownMenuItem>}
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={p.deleting} onClick={p.onDelete}>{p.deleting ? "Törlés…" : "Törlés"}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
          </span>
        </div>
        <h1 className={s.name}>{p.companyId ? <Link href={`/companies/${p.companyId}`}>{p.name}</Link> : p.name}</h1>
        {subParts.length > 0 && (
          <p className={s.sub}>{subParts.map((x, i) => <span key={i}>{i > 0 && ", "}{x}</span>)}</p>
        )}
        <div className={s.reach}>
          {tel && <a href={tel} className={s.phone}><Phone size={16} />{p.phone}</a>}
          {p.email && <a href={`mailto:${p.email}`}><Mail size={16} />{p.email}</a>}
        </div>
      </div>
      <div className={s.act}>
        {!p.calling && <CallLink tel={tel} onCall={p.onCall} outline={p.callOutline} />}
      </div>
    </div>
  );
}
