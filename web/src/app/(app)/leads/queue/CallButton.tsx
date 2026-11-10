"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Phone } from "lucide-react";
import s from "./queue.module.css";

export function CallButton({ id, name, phone, primary }: { id: number; name: string; phone: string | null; primary: boolean }) {
  const router = useRouter();
  const tel = phone?.replace(/[^\d+]/g, "") ?? "";
  if (!tel) {
    // PROPOSAL copy
    return <Link href={`/leads/${id}`} className={s.btn}>Megnyitás</Link>;
  }
  return (
    // No preventDefault: the tel: link must still fire; the push opens the lead page.
    <a
      href={`tel:${tel}`}
      aria-label={`Hívás: ${name}`} // PROPOSAL copy
      className={`${s.btn} ${primary ? s.btnPrimary : ""}`}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        router.push(`/leads/${id}`);
      }}
    >
      <Phone size={16} aria-hidden /> Hívás {/* PROPOSAL copy */}
    </a>
  );
}
