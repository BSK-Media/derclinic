"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { disablePushOnThisDevice } from "@/components/push-toggle";

export function DeleteAccountCard({ hasPassword }: { hasPassword: boolean }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  async function remove(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await disablePushOnThisDevice("patient").catch(() => {});
      const res = await fetch("/api/patient/account", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: hasPassword ? password : undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setError(data?.message || "Nie udało się usunąć konta.");
        return;
      }
      router.push("/panel-klienta/logowanie");
      router.refresh();
    } catch {
      setError("Nie udało się połączyć z serwerem. Spróbuj ponownie.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-5 rounded-2xl border border-red-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-1 text-sm font-semibold text-zinc-900">Usuń konto</div>
      <p className="text-xs text-zinc-500">
        Stracisz dostęp do panelu klienta i powiadomień. Historia wizyt pozostaje w dokumentacji kliniki — zgodnie z
        obowiązkiem jej prowadzenia. Później możesz założyć nowe konto.
      </p>
      {open ? (
        <form onSubmit={remove} className="mt-3 space-y-3">
          {hasPassword ? (
            <input
              type="password"
              autoComplete="current-password"
              placeholder="Podaj hasło, aby potwierdzić"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
            />
          ) : null}
          {error ? <p role="alert" className="text-xs text-red-600">{error}</p> : null}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
            >
              {loading ? "Usuwanie…" : "Usuń konto na stałe"}
            </button>
            <button
              type="button"
              onClick={() => { setOpen(false); setPassword(""); setError(""); }}
              className="rounded-xl border border-zinc-200 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50"
            >
              Anuluj
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-3 rounded-xl border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
        >
          Usuń konto
        </button>
      )}
    </div>
  );
}
