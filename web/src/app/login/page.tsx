"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <div
      className="min-h-screen flex items-center justify-center relative"
      style={{ background: "var(--bg-page)" }}
    >
      {/* Dot grid inherited from body */}

      {/* Glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(900px 600px at 50% 40%, oklch(0.66 0.19 278 / 0.08), transparent 65%)",
        }}
      />

      <div className="relative z-10 w-full max-w-sm px-4">
        {/* Brand mark */}
        <div className="flex flex-col items-center mb-8">
          <div
            className="flex items-center justify-center rounded-xl mb-4"
            style={{
              width: 44, height: 44,
              background: "linear-gradient(135deg, var(--indigo) 0%, oklch(0.56 0.18 295) 100%)",
              boxShadow: "var(--glow-indigo)",
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M3 12 C7 4, 11 20, 15 12 S 21 4, 21 12" stroke="white" strokeWidth="2" strokeLinecap="round" fill="none"/>
            </svg>
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: "var(--fg)", letterSpacing: "-0.01em" }}>
            Helm CRM
          </h1>
          <p style={{ fontSize: 12, color: "var(--fg-faint)", fontFamily: "var(--font-mono-ndt)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 4 }}>
            Controllabor · EU
          </p>
        </div>

        {/* Card */}
        <div
          className="rounded-xl p-6"
          style={{
            background: "var(--bg-panel)",
            border: "1px solid var(--line-soft)",
            boxShadow: "var(--shadow-card)",
          }}
        >
          <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--fg)", marginBottom: 16 }}>
            Bejelentkezés
          </h2>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--fg-faint)", textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 6 }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@controllabor.hu"
                required
                autoFocus
                style={{
                  width: "100%", height: 36, padding: "0 12px",
                  background: "var(--bg-raised)", border: "1px solid var(--line)",
                  borderRadius: 6, color: "var(--fg)", fontSize: 14, outline: "none",
                  fontFamily: "inherit",
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = "var(--indigo-line)";
                  e.target.style.boxShadow = "0 0 0 3px var(--indigo-soft)";
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = "var(--line)";
                  e.target.style.boxShadow = "none";
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--fg-faint)", textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 6 }}>
                Jelszó
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                style={{
                  width: "100%", height: 36, padding: "0 12px",
                  background: "var(--bg-raised)", border: "1px solid var(--line)",
                  borderRadius: 6, color: "var(--fg)", fontSize: 14, outline: "none",
                  fontFamily: "inherit",
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = "var(--indigo-line)";
                  e.target.style.boxShadow = "0 0 0 3px var(--indigo-soft)";
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = "var(--line)";
                  e.target.style.boxShadow = "none";
                }}
              />
            </div>

            {error && (
              <p style={{ fontSize: 14, color: "var(--coral)" }}>{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%", height: 36, marginTop: 4,
                background: "linear-gradient(180deg, var(--indigo), var(--indigo-dim))",
                border: "1px solid var(--indigo-dim)",
                borderRadius: 6, color: "white", fontSize: 14, fontWeight: 500,
                cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1,
                boxShadow: "0 0 0 1px oklch(0.66 0.19 278 / 0.3), 0 4px 14px -4px oklch(0.66 0.19 278 / 0.6)",
                fontFamily: "inherit",
              }}
            >
              {loading ? "Bejelentkezés..." : "Bejelentkezés"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
