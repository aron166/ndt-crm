"use client";

import { useRef, useState, useTransition } from "react";
import { addSuppression } from "@/app/actions/suppressions";
import k from "@/components/astryx/page.module.css";
import s from "../settings.module.css";

export function SuppressionForm() {
  const ref = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(fd: FormData) {
    setError(null);
    start(async () => {
      const res = await addSuppression(fd);
      if ("error" in res && res.error) setError(res.error);
      else ref.current?.reset();
    });
  }

  return (
    <form ref={ref} action={submit} className={s.form}>
      <div className={s.grid3}>
        <div>
          <label className={s.label} htmlFor="sup-target">Email cím vagy domain</label>
          <input id="sup-target" name="target" required placeholder="nev@ceg.hu vagy ceg.hu" className={s.field} />
        </div>
        <div>
          <label className={s.label} htmlFor="sup-date">Kérés dátuma</label>
          <input id="sup-date" name="requestedAt" type="date" required className={s.field} />
        </div>
        <div>
          <label className={s.label} htmlFor="sup-channel">Csatorna</label>
          <select id="sup-channel" name="channel" defaultValue="" className={s.field}>
            <option value="">-</option>
            <option value="email">Email</option>
            <option value="phone">Telefon</option>
            <option value="linkedin">LinkedIn</option>
            <option value="in_person">Személyesen</option>
          </select>
        </div>
      </div>
      <div className={s.grid2}>
        <div>
          <label className={s.label} htmlFor="sup-source">Forrás</label>
          <input id="sup-source" name="source" maxLength={200} className={s.field} />
        </div>
        <div>
          <label className={s.label} htmlFor="sup-note">Megjegyzés</label>
          <input id="sup-note" name="note" maxLength={1000} className={s.field} />
        </div>
      </div>
      {error && <div role="alert" className={s.alert}>{error}</div>}
      <div className={s.footer}>
        <button type="submit" disabled={pending} className={`${k.btn} ${k.btnPrimary}`}>Hozzáadás</button>
      </div>
    </form>
  );
}
