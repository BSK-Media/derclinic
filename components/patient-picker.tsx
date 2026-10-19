"use client";

import * as React from "react";
import useSWR from "swr";
import { Input } from "@/components/ui/input";

export const NEW_PATIENT = "__NEW__";
const MIN_SEARCH_CHARS = 3;
const searchFetcher = (url: string) => fetch(url).then((r) => r.json());

// Wybór pacjenta bez wczytanej listy: opcjonalny przycisk „Nowy klient” i wyszukiwarka. Od 3 znaków serwer podpowiada
// wszystkich pacjentów, w których nazwisku, telefonie lub e-mailu występuje wpisany fragment.
export function PatientPicker({
  locationId,
  value,
  onChange,
  allowNew = true,
}: {
  locationId?: string;
  value: string;
  onChange: (value: string) => void;
  allowNew?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [pickedName, setPickedName] = React.useState("");
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const searchRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const enough = debounced.length >= MIN_SEARCH_CHARS;
  const { data, isLoading } = useSWR<{
    ok: boolean;
    total?: number;
    patients: { id: string; name: string; phone?: string | null }[];
  }>(
    open && enough
      ? `/api/admin/patients/search?q=${encodeURIComponent(debounced)}${locationId ? `&locationId=${encodeURIComponent(locationId)}` : ""}`
      : null,
    searchFetcher,
    { keepPreviousData: false },
  );
  const results = data?.patients ?? [];

  React.useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => searchRef.current?.focus(), 0);
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const selectedLabel = value === NEW_PATIENT ? "➕ Nowy klient" : value ? pickedName : "";

  function pick(next: string, name = "") {
    setPickedName(name);
    onChange(next);
    setOpen(false);
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => {
          setOpen((prev) => !prev);
          setQuery("");
          setDebounced("");
        }}
        className="flex h-10 w-full items-center justify-between rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
      >
        <span className={selectedLabel ? "" : "text-zinc-400"}>{selectedLabel || "Wybierz lub wyszukaj"}</span>
        <span className="text-zinc-400">▾</span>
      </button>

      {open ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg dark:border-zinc-800 dark:bg-[#0b1220]">
          <div className="border-b p-2">
            <Input
              ref={searchRef}
              placeholder="Szukaj klienta (min. 3 znaki)…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="max-h-64 overflow-auto py-1 text-sm">
            {allowNew ? (
              <button
                type="button"
                onClick={() => pick(NEW_PATIENT)}
                className={
                  "block w-full border-b px-3 py-2 text-left font-medium text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-500/10 " +
                  (value === NEW_PATIENT ? "bg-emerald-50 dark:bg-emerald-500/10" : "")
                }
              >
                ➕ Nowy klient
              </button>
            ) : null}
            {!enough ? (
              <div className="px-3 py-2 text-zinc-500">
                Wpisz minimum {MIN_SEARCH_CHARS} znaki (nazwisko, telefon lub e-mail), aby wyszukać klienta.
              </div>
            ) : isLoading && !data ? (
              <div className="px-3 py-2 text-zinc-500">Szukam…</div>
            ) : results.length === 0 ? (
              <div className="px-3 py-2 text-zinc-500">Brak wyników.</div>
            ) : (
              <>
                {results.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => pick(p.id, p.name)}
                    className={
                      "block w-full px-3 py-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-900 " +
                      (value === p.id ? "bg-zinc-100 font-medium dark:bg-zinc-800" : "")
                    }
                  >
                    <span>{p.name}</span>
                    {p.phone ? <span className="ml-2 text-xs text-zinc-500">{p.phone}</span> : null}
                  </button>
                ))}
                {(data?.total ?? 0) > results.length ? (
                  <div className="px-3 py-2 text-xs text-zinc-500">
                    Pokazano {results.length} z {data?.total}. Wpisz więcej znaków, aby zawęzić wyniki.
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
