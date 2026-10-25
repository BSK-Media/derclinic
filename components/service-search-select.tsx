"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { formatPLNFromGrosze } from "@/lib/money";

export type ServiceOption = { id: string; name: string; price?: number | null };

// Wybór usługi z wyszukiwaniem po fragmencie nazwy (lista usług jest już wczytana).
export function ServiceSearchSelect({
  services,
  value,
  onChange,
  placeholder = "Wybierz lub wyszukaj usługę",
}: {
  services: ServiceOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const searchRef = React.useRef<HTMLInputElement | null>(null);

  const selected = services.find((service) => service.id === value) ?? null;
  const needle = query.trim().toLocaleLowerCase("pl");
  const results = React.useMemo(
    () => (needle ? services.filter((service) => service.name.toLocaleLowerCase("pl").includes(needle)) : services).slice(0, 50),
    [services, needle],
  );

  React.useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => searchRef.current?.focus(), 0);
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [open]);

  function pick(id: string) {
    onChange(id);
    setOpen(false);
  }

  return (
    <div className="relative min-w-0 flex-1" ref={rootRef}>
      <button
        type="button"
        onClick={() => {
          setOpen((prev) => !prev);
          setQuery("");
          setActive(0);
        }}
        className="flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-left text-sm dark:border-zinc-800 dark:bg-zinc-950"
      >
        <span className={selected ? "truncate" : "truncate text-zinc-400"}>{selected?.name ?? placeholder}</span>
        <span className="text-zinc-400">▾</span>
      </button>
      {open ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg dark:border-zinc-800 dark:bg-[#0b1220]">
          <div className="border-b p-2">
            <Input
              ref={searchRef}
              placeholder="Szukaj usługi…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((i) => Math.min(results.length - 1, i + 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((i) => Math.max(0, i - 1));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  if (results[active]) pick(results[active].id);
                }
              }}
            />
          </div>
          <div className="max-h-60 overflow-auto py-1 text-sm">
            {results.length === 0 ? (
              <div className="px-3 py-2 text-zinc-500">Brak usług pasujących do „{query}”.</div>
            ) : (
              results.map((service, index) => (
                <button
                  key={service.id}
                  type="button"
                  onClick={() => pick(service.id)}
                  onMouseEnter={() => setActive(index)}
                  className={
                    "flex w-full items-center justify-between gap-2 px-3 py-2 text-left " +
                    (index === active ? "bg-zinc-100 dark:bg-zinc-800 " : "") +
                    (service.id === value ? "font-medium" : "")
                  }
                >
                  <span>{service.name}</span>
                  {typeof service.price === "number" ? (
                    <span className="shrink-0 text-xs text-zinc-500">{formatPLNFromGrosze(service.price)}</span>
                  ) : null}
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
