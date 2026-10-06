"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";

export type PickerClient = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  // Czy klient w ogóle może dostać newsletter (zgoda marketingowa + e-mail).
  subscribed: boolean;
};

// Wyszukiwarka klientów z polami wyboru (po imieniu, e-mailu lub telefonie).
// Wybrani klienci są też widoczni jako lista „chipów" z możliwością odznaczenia.
//  * allowUnsubscribed=false — klienci bez zgody marketingowej są wyszarzeni
//    (nie da się ich wybrać do wysyłki),
//  * allowUnsubscribed=true — można ich dodać (np. do listy), ale dostaną
//    wiadomość dopiero po wyrażeniu zgody.
export function NewsletterClientPicker({
  selectedIds,
  onChange,
  allowUnsubscribed = false,
  disabled = false,
}: {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  allowUnsubscribed?: boolean;
  disabled?: boolean;
}) {
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<PickerClient[]>([]);
  const [loading, setLoading] = React.useState(false);
  // Dane znanych klientów (z wyników wyszukiwania i z doczytania wybranych po id).
  const [known, setKnown] = React.useState<Record<string, PickerClient>>({});

  const remember = React.useCallback((clients: PickerClient[]) => {
    setKnown((prev) => {
      const next = { ...prev };
      for (const client of clients) next[client.id] = client;
      return next;
    });
  }, []);

  // Wyszukiwanie z opóźnieniem (debounce).
  React.useEffect(() => {
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/newsletter/clients?q=${encodeURIComponent(query.trim())}`, {
          cache: "no-store",
        });
        const out = await res.json().catch(() => ({}));
        const clients: PickerClient[] = out?.clients ?? [];
        setResults(clients);
        remember(clients);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [query, remember]);

  // Doczytanie nazw klientów, którzy są już wybrani (np. po otwarciu zapisanego szkicu).
  React.useEffect(() => {
    const missing = selectedIds.filter((id) => !known[id]);
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/admin/newsletter/clients?ids=${encodeURIComponent(missing.join(","))}`, {
        cache: "no-store",
      });
      const out = await res.json().catch(() => ({}));
      if (!cancelled && out?.clients) remember(out.clients as PickerClient[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedIds, known, remember]);

  const selected = new Set(selectedIds);
  const canPick = (client: PickerClient) => allowUnsubscribed || client.subscribed;

  function toggle(client: PickerClient) {
    if (disabled || !canPick(client)) return;
    onChange(selected.has(client.id) ? selectedIds.filter((id) => id !== client.id) : [...selectedIds, client.id]);
  }

  return (
    <div className="space-y-3">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Szukaj klienta po imieniu, e-mailu lub telefonie…"
        disabled={disabled}
        autoComplete="off"
      />

      <div className="max-h-56 overflow-auto rounded-xl border border-slate-200 dark:border-white/10">
        {loading && results.length === 0 ? <div className="p-3 text-sm text-slate-500">Szukanie…</div> : null}
        {!loading && results.length === 0 ? <div className="p-3 text-sm text-slate-500">Brak wyników.</div> : null}
        {results.map((client) => {
          const pickable = canPick(client);
          return (
            <label
              key={client.id}
              className={
                "flex items-center gap-3 border-b border-slate-100 px-3 py-2 text-sm last:border-b-0 dark:border-white/5 " +
                (pickable && !disabled ? "cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5" : "opacity-60")
              }
            >
              <input
                type="checkbox"
                checked={selected.has(client.id)}
                onChange={() => toggle(client)}
                disabled={disabled || !pickable}
                className="h-4 w-4 shrink-0 accent-emerald-600"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-slate-900 dark:text-white">{client.name}</span>
                <span className="block truncate text-xs text-slate-500">
                  {[client.email, client.phone].filter(Boolean).join(" · ") || "brak danych kontaktowych"}
                </span>
              </span>
              {!client.subscribed ? (
                <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                  brak zgody marketingowej
                </span>
              ) : null}
            </label>
          );
        })}
      </div>

      <div>
        <div className="mb-1 text-xs font-medium text-slate-500">Wybrani klienci ({selectedIds.length})</div>
        {selectedIds.length === 0 ? (
          <div className="text-xs text-slate-400">Nikt nie jest jeszcze wybrany.</div>
        ) : (
          <div className="flex max-h-28 flex-wrap gap-1.5 overflow-auto">
            {selectedIds.map((id) => (
              <span
                key={id}
                className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200"
              >
                {known[id]?.name ?? "…"}
                {!disabled ? (
                  <button
                    type="button"
                    aria-label="Odznacz"
                    onClick={() => onChange(selectedIds.filter((x) => x !== id))}
                    className="text-emerald-700 hover:text-red-600 dark:text-emerald-300"
                  >
                    ×
                  </button>
                ) : null}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
