"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { Loader2, CheckCircle2 } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = React.useState("");
  const [error, setError] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [message, setMessage] = React.useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!/^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(email.trim())) {
      setError("Niepoprawny adres e-mail");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/patient/forgot-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) {
        setError(result?.message || "Nie udało się wysłać linku. Spróbuj ponownie.");
        return;
      }
      setMessage(result.message || "Jeśli ten adres e-mail ma konto, wysłaliśmy na niego link do resetu hasła.");
      setSent(true);
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

        {sent ? (
          <div className="text-center">
            <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-emerald-600" />
            <h1 className="mb-1 text-xl font-semibold text-zinc-900">Sprawdź skrzynkę e-mail</h1>
            <p className="mb-6 text-sm text-zinc-500">{message}</p>
            <Link
              href="/panel-klienta/logowanie"
              className="block w-full rounded-xl bg-emerald-600 py-3 text-center text-sm font-semibold text-white transition hover:bg-emerald-700"
            >
              Wróć do logowania
            </Link>
          </div>
        ) : (
          <>
            <h1 className="mb-1 text-center text-xl font-semibold text-zinc-900">Zresetuj hasło</h1>
            <p className="mb-6 text-center text-sm text-zinc-500">
              Podaj adres e-mail przypisany do konta — wyślemy na niego link do ustawienia nowego hasła.
            </p>

            <form className="space-y-4" onSubmit={submit}>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-zinc-600">E-mail</span>
                <input
                  className="input"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>

              {error ? <div className="text-sm text-red-600">{error}</div> : null}

              <button
                type="submit"
                disabled={submitting}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {submitting ? "Wysyłanie…" : "Wyślij link do resetu"}
              </button>
            </form>

            <p className="mt-5 text-center text-xs text-zinc-500">
              <Link href="/panel-klienta/logowanie" className="font-medium text-emerald-700 hover:underline">
                Wróć do logowania
              </Link>
            </p>
          </>
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
