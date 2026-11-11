"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { NOT_A_CRM_USER } from "@/lib/crm-user-message";
import { AstryxProviders } from "@/components/layout/AstryxProviders";
import k from "@/components/astryx/page.module.css";
import m from "./login.module.css";

// The proxy sends signed-in accounts without a CRM user here with ?denied=1.
const noSubscribe = () => () => {};
const readDenied = () => new URLSearchParams(window.location.search).has("denied");

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const denied = useSyncExternalStore(noSubscribe, readDenied, () => false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError("Hibás email cím vagy jelszó.");
      setLoading(false);
    } else {
      router.push("/");
      router.refresh();
    }
  }

  return (
    <AstryxProviders>
      <div className={m.page}>
        <div className={m.wrap}>
          {/* Brand mark */}
          <div className={m.brand}>
            <div className={m.mark}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path d="M3 12 C7 4, 11 20, 15 12 S 21 4, 21 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none"/>
              </svg>
            </div>
            <h1 className={m.title}>
              Helm CRM
            </h1>
            <p className={m.sub}>
              Controllabor · EU
            </p>
          </div>

          {/* Card */}
          <section className={`${k.card} ${m.card}`}>
            <h2 className={m.heading}>
              Bejelentkezés
            </h2>

            <form onSubmit={handleSubmit} className={m.form}>
              <div>
                <label className={m.label}>
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@controllabor.hu"
                  required
                  autoFocus
                  className={m.field}
                />
              </div>

              <div>
                <label className={m.label}>
                  Jelszó
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className={m.field}
                />
              </div>

              {denied && !error && (
                <p className={m.error}>{NOT_A_CRM_USER}</p>
              )}
              {error && (
                <p className={m.error}>{error}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                className={`${k.btn} ${k.btnPrimary} ${m.submit}`}
              >
                {loading ? "Bejelentkezés..." : "Bejelentkezés"}
              </button>
            </form>
          </section>
        </div>
      </div>
    </AstryxProviders>
  );
}
