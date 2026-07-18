"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

type SearchItem = {
  id: string;
  title: string;
  subtitle?: string;
  href: string;
};

type SearchGroup = { key: string; label: string; items: SearchItem[] };

export function GlobalSearch() {
  const router = useRouter();
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);

  const [query, setQuery] = React.useState("");
  const [groups, setGroups] = React.useState<SearchGroup[]>([]);
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(-1);

  const flat = React.useMemo(() => groups.flatMap((g) => g.items), [groups]);

  // Debounce + AJAX
  React.useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setGroups([]);
      setLoading(false);
      abortRef.current?.abort();
      return;
    }
    setLoading(true);
    const timer = window.setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        const data = await res.json().catch(() => null);
        if (!controller.signal.aborted) {
          setGroups(data?.ok ? (data.groups ?? []) : []);
          setActiveIndex(-1);
          setLoading(false);
        }
      } catch {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  // Zamknięcie po kliknięciu poza
  React.useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  function goTo(item: SearchItem) {
    setOpen(false);
    setQuery("");
    setGroups([]);
    router.push(item.href);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (!open || flat.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % flat.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? flat.length - 1 : i - 1));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      goTo(flat[activeIndex]);
    }
  }

  const showDropdown = open && query.trim().length >= 2;
  let runningIndex = -1;

  return (
    <div ref={containerRef} className="relative flex-1">
      <div className="flex h-11 items-center gap-3 rounded-2xl border border-white/60 bg-white/70 px-4 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#0b1220]/55">
        <span className="text-slate-400 dark:text-slate-500">⌕</span>
        <input
          ref={inputRef}
          aria-label="Wyszukaj"
          placeholder="Wyszukaj..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400 dark:placeholder:text-slate-500"
        />
        {loading && showDropdown ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-emerald-500" />
        ) : null}
      </div>

      {showDropdown ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[70vh] overflow-auto rounded-2xl border border-white/60 bg-white p-2 shadow-lg dark:border-white/10 dark:bg-[#0b1220]">
          {groups.length === 0 ? (
            <div className="px-3 py-4 text-sm text-slate-500">
              {loading ? "Szukam…" : "Brak wyników."}
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.key} className="py-1">
                <div className="px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  {group.label}
                </div>
                {group.items.map((item) => {
                  runningIndex += 1;
                  const index = runningIndex;
                  const active = index === activeIndex;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => goTo(item)}
                      onMouseEnter={() => setActiveIndex(index)}
                      className={
                        "flex w-full flex-col items-start rounded-xl px-3 py-2 text-left transition " +
                        (active
                          ? "bg-emerald-50 dark:bg-emerald-500/10"
                          : "hover:bg-slate-50 dark:hover:bg-white/5")
                      }
                    >
                      <span className="text-sm font-medium text-slate-800 dark:text-slate-100">
                        {item.title}
                      </span>
                      {item.subtitle ? (
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {item.subtitle}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
