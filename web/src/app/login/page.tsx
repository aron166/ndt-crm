"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setError(error.message);
    } else {
      setSent(true);
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-indigo-600 mb-4">
            <span className="text-white font-bold text-xl">C</span>
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">NDT CRM</h1>
          <p className="text-sm text-slate-500 mt-1">Controllabor Kft.</p>
        </div>

        {sent ? (
          <div className="bg-white rounded-xl border border-slate-200 p-6 text-center shadow-sm">
            <div className="text-4xl mb-3">✉️</div>
            <h2 className="font-semibold text-slate-900 mb-1">
              Ellenőrizd az emailedet
            </h2>
            <p className="text-sm text-slate-500">
              Küldtünk egy belépési linket a{" "}
              <span className="font-medium text-slate-700">{email}</span> címre.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h2 className="font-semibold text-slate-900 mb-1">Bejelentkezés</h2>
            <p className="text-sm text-slate-500 mb-5">
              Add meg az email címedet — küldünk egy belépési linket.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                type="email"
                placeholder="email@controllabor.hu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
              {error && (
                <p className="text-sm text-red-600">{error}</p>
              )}
              <Button
                type="submit"
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
                disabled={loading}
              >
                {loading ? "Küldés..." : "Belépési link küldése"}
              </Button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
