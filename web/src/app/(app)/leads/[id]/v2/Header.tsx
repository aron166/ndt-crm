"use client";

import Link from "next/link";
import { Mail, MoreHorizontal, Phone } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { TIER_LABEL, isTier } from "@/lib/leads/tier";
import s from "./lead2.module.css";

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
  canClose: boolean;
  deleting: boolean;
  onCall: () => void;
  onEdit: () => void;
  onOwner: () => void;
  onClose: () => void;
  onDelete: () => void;
}) {
  const contact = p.contactName && p.personHref ? <Link href={p.personHref}>{p.contactName}</Link> : p.contactName;
  const subParts = [contact, p.role, p.town].filter(Boolean);
  const tel = p.phone ? `tel:${p.phone.replace(/[^\d+]/g, "")}` : null;
  return (
    <div className={s.head}>
      <div className={s.who}>
        <div className={s.chips}>
          <span className={s.chip}>{p.stageLabel}</span>
          {isTier(p.tier) && <span className={s.chip}>{`${p.tier} · ${TIER_LABEL[p.tier]}`}</span>}
          {/* PROPOSAL copy */}
          <span className={s.chip}>{`Felelős: ${p.ownerName ?? "nincs"}`}</span>
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
        <DropdownMenu>
          <DropdownMenuTrigger className={buttonVariants({ variant: "outline", size: "icon" })} aria-label="Továbbiak">
            <MoreHorizontal size={18} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {/* PROPOSAL copy: menu items */}
            <DropdownMenuItem onClick={p.onEdit}>Szerkesztés</DropdownMenuItem>
            <DropdownMenuItem onClick={p.onOwner}>Felelős módosítása</DropdownMenuItem>
            {p.canClose && <DropdownMenuItem onClick={p.onClose}>Lezárás</DropdownMenuItem>}
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={p.deleting} onClick={p.onDelete}>{p.deleting ? "Törlés…" : "Törlés"}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {!p.calling && (
          <div className={s.callWrap}>
            {/* tel: dials on a phone; a desktop browser only switches to calling mode. */}
            <a
              href={tel ?? undefined}
              role={tel ? undefined : "button"}
              tabIndex={tel ? undefined : 0}
              className={s.callBtn}
              onClick={(e) => {
                if (!window.matchMedia("(pointer: coarse)").matches) e.preventDefault();
                p.onCall();
              }}
            >
              <Phone size={20} />{/* PROPOSAL copy */}Hívás
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
