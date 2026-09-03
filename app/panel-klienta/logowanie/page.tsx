"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

function sanitizePhoneInput(raw: string) {
  let digitsCount = 0;
  let result = "";
  for (const char of raw) {
    if (char === " ") {
      result += char;
      continue;
    }
    if (/\d/.test(char)) {
      if (digitsCount >= 9) continue;
      digitsCount += 1;
      result += char;
    }
  }
  return result;
}

function phoneDigitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

export default function PatientLoginPage() {
  const router = useRouter();
  const [phone, setPhone] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const digits = phoneDigitsOnly(phone);
    if (digits.length !== 9) {
      setError("Podaj prawidłowy 9-cyfrowy numer telefonu");
      return;
    }
    if (!password) {
      setError("Podaj hasło");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/patient/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: `+48${digits}`, password }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) {
        setError(result?.message || "Nie udało się zalogować");
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
        <h1 className="mb-1 text-center text-xl font-semibold text-zinc-900">Panel klienta</h1>
        <p className="mb-6 text-center text-sm text-zinc-500">Zaloguj się, aby zobaczyć historię wizyt.</p>

        <form className="space-y-4" onSubmit={submit}>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-zinc-600">Telefon</span>
            <div className="input phone-input-group">
              <span className="shrink-0 text-sm text-zinc-500">+48</span>
              <input
                className="w-full border-0 bg-transparent p-0 text-sm outline-none"
                inputMode="numeric"
                autoComplete="tel-national"
                value={phone}
                onChange={(e) => setPhone(sanitizePhoneInput(e.target.value))}
                placeholder="600 000 000"
              />
            </div>
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-zinc-600">Hasło</span>
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          {error ? <div className="text-sm text-red-600">{error}</div> : null}

          <button
            type="submit"
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {submitting ? "Logowanie…" : "Zaloguj się"}
          </button>
        </form>

        <p className="mt-5 text-center text-xs text-zinc-500">
          Rezerwowałaś/eś jako gość i nie masz jeszcze hasła?{" "}
          <Link href="/panel-klienta/rejestracja" className="font-medium text-emerald-700 hover:underline">
            Dokończ zakładanie konta
          </Link>
        </p>
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
        .phone-input-group {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .phone-input-group:focus-within {
          border-color: #10b981;
          box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.15);
        }
      `}</style>
    </div>
  );
}
