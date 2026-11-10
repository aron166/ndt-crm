"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Phone } from "lucide-react";
import s from "./queue.module.css";

export function CallButton({ id, phone, primary }: { id: number; phone: string | null; primary: boolean }) {
  const router = useRouter();
  if (!phone) {
    // PROPOSAL copy
    return <Link href={`/leads/${id}`} className={s.btn}>Megnyitás</Link>;
  }
  return (
    // No preventDefault: the tel: link must still fire; the push opens the lead page.
    <a
      href={`tel:${phone.replace(/[^\d+]/g, "")}`}
      className={`${s.btn} ${primary ? s.btnPrimary : ""}`}
      onClick={() => router.push(`/leads/${id}`)}
    >
      <Phone size={16} aria-hidden /> Hívás {/* PROPOSAL copy */}
    </a>
  );
}
