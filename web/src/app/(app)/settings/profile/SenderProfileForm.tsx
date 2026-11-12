"use client";

import { useState, useTransition } from "react";
import { saveSenderProfile } from "@/app/actions/sender-profile";
import k from "@/components/astryx/page.module.css";
import s from "../settings.module.css";

export function SenderProfileForm({ name: n0, phone: p0 }: { name: string; phone: string }) {
  const [name, setName] = useState(n0);
  const [phone, setPhone] = useState(p0);
  const [msg, setMsg] = useState<{ error?: string; saved?: true } | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    start(async () => {
      const res = await saveSenderProfile({ name, phone });
      setMsg("error" in res && res.error ? { error: res.error } : { saved: true });
    });
  }

  return (
    <form onSubmit={submit} className={s.form}>
      <div className={s.fieldGrid}>
        <div>
          <label className={s.label} htmlFor="sp-name">Feladó neve</label>
          <input id="sp-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} autoComplete="name" className={s.field} />
        </div>
        <div>
          <label className={s.label} htmlFor="sp-phone">Telefonszám</label>
          <input id="sp-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+36 30 123 4567" inputMode="tel" autoComplete="tel" className={s.field} />
        </div>
      </div>
      {msg?.error && <p className={k.error} role="alert">{msg.error}</p>}
      {msg?.saved && <p className={k.muted} role="status">Mentve.</p>}
      <div className={s.footer}>
        <button type="submit" disabled={pending || !name.trim()} className={`${k.btn} ${k.btnPrimary}`}>{pending ? "Mentés..." : "Mentés"}</button>
      </div>
    </form>
  );
}
