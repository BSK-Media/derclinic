"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function ResetPasswordPage() {
  return (
    <React.Suspense fallback={null}>
      <ResetPasswordForm />
    </React.Suspense>
  );
}

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const [password, setPassword] = React.useState("");
  const [passwordConfirm, setPasswordConfirm] = React.useState("");
  const [error, setError] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!token) {
      setError("Link jest nieprawidłowy. Poproś o nowy link do resetu hasła.");
      return;
    }
    if (password.length < 6) {
      setError("Hasło musi mieć co najmniej 6 znaków");
      return;
    }
    if (password !== passwordConfirm) {
      setError("Podane hasła różnią się od siebie");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/patient/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) {
        setError(result?.message || "Nie udało się ustawić nowego hasła");
        return;
      }
      router.push("/panel-klienta");
      router.refresh();
    } catch {
      setError("Nie udało się połączyć z serwerem. Spróbuj ponownie.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4">
      <div className="w-full max-w-sm rounded-2xl border bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex justify-center">
          <Image src="/derclinic-logo.webp" alt="DerClinic" width={160} height={40} priority />
        </div>
        <h1 className="mb-1 text-center text-xl font-semibold text-zinc-900">Ustaw nowe hasło</h1>
        <p className="mb-6 text-center text-sm text-zinc-500">Wpisz nowe hasło do swojego konta w panelu klienta.</p>

        {!token ? (
          <div className="rounded-xl bg-red-50 px-3 py-2.5 text-center text-sm text-red-700">
            Ten link jest nieprawidłowy albo niekompletny.{" "}
            <Link href="/panel-klienta/zapomniane-haslo" className="font-medium underline">
              Poproś o nowy
            </Link>
            .
          </div>
        ) : (
          <form className="space-y-4" onSubmit={submit}>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-zinc-600">Nowe hasło</span>
              <input
                className="input"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="min. 6 znaków"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-zinc-600">Powtórz nowe hasło</span>
              <input
                className="input"
                type="password"
                autoComplete="new-password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
              />
            </label>

            {error ? <div className="text-sm text-red-600">{error}</div> : null}

            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {submitting ? "Zapisywanie…" : "Ustaw nowe hasło"}
            </button>
          </form>
        )}
      </div>

      <style jsx global>{`
        .input {
          width: 100%;
          border-radius: 0.75rem;
          border: 1px solid #e4e4e7;
          padding: 0.6rem 0.75rem;
          font-size: 0.875rem;
          outline: none;
          color-scheme: light only;
        }
        .input:focus {
          border-color: #10b981;
          box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.15);
        }
      `}</style>
    </div>
  );
}
