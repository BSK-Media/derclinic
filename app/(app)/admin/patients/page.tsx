"use client";

import useSWR from "swr";
import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronRight,
  Mail,
  MessageSquareText,
  Phone,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatPLNFromGrosze } from "@/lib/money";
import { RFM_SEGMENT_FILTER_OPTIONS, RfmSegmentBadge } from "@/components/rfm-panel";
import { cn } from "@/lib/utils";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Patient = {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  note?: string | null;
  createdAt: string;
  lastVisitAt?: string | null;
  totalSpent?: number;
  completedVisits?: number;
  rfmSegment?: string | null;
};

type SortKey = "name" | "createdAt" | "lastVisitAt" | "totalSpent" | "completedVisits" | "rfmSegment";

// Kolejność segmentów przy sortowaniu: od najcenniejszych; pacjenci bez segmentu na końcu.
const SEGMENT_ORDER = ["VIP", "LOYAL", "NEW", "WIN_BACK", "AT_RISK", "DORMANT", "OTHER"];
const segmentRank = (segment?: string | null) => {
  const index = segment ? SEGMENT_ORDER.indexOf(segment) : -1;
  return index === -1 ? SEGMENT_ORDER.length : index;
};
type SortDirection = "asc" | "desc";
type QuickSort = "all" | "lastVisitAt" | "completedVisits" | "totalSpent";


function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function avatarTone(name: string) {
  const value = [...name].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return value % 3 === 0
    ? "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-200"
    : value % 3 === 1
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200"
      : "bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-200";
}

function pageNumbers(current: number, count: number): (number | "…")[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);
  const pages = new Set([1, count, current - 1, current, current + 1]);
  if (current <= 3) [2, 3, 4].forEach((n) => pages.add(n));
  if (current >= count - 2) [count - 1, count - 2, count - 3].forEach((n) => pages.add(n));
  const sorted = [...pages].filter((n) => n >= 1 && n <= count).sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  sorted.forEach((n, i) => {
    if (i > 0 && n - sorted[i - 1] > 1) out.push("…");
    out.push(n);
  });
  return out;
}

function Pagination({
  page,
  pageCount,
  total,
  pageSize,
  onPage,
  onPageSize,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
}) {
  const [jump, setJump] = useState("");
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const go = (value: number) => onPage(Math.min(Math.max(1, value), pageCount));
  const base = "inline-flex h-9 min-w-9 items-center justify-center rounded-lg border px-2 text-sm font-medium transition disabled:opacity-40";
  return (
    <div className="flex flex-col items-center gap-3 border-t p-4 md:flex-row md:justify-between">
      <div className="text-sm text-zinc-500">
        {from}–{to} z {total}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        <button type="button" className={cn(base, "bg-white dark:bg-[#0b1220]")} disabled={page <= 1} onClick={() => go(page - 1)} aria-label="Poprzednia strona">
          ‹
        </button>
        {pageNumbers(page, pageCount).map((entry, index) =>
          entry === "…" ? (
            <span key={`gap-${index}`} className="px-1 text-zinc-400">
              …
            </span>
          ) : (
            <button
              key={entry}
              type="button"
              onClick={() => go(entry)}
              aria-current={entry === page ? "page" : undefined}
              className={cn(
                base,
                entry === page
                  ? "border-emerald-600 bg-emerald-600 text-white"
                  : "bg-white text-zinc-700 hover:bg-zinc-50 dark:bg-[#0b1220] dark:text-zinc-200",
              )}
            >
              {entry}
            </button>
          ),
        )}
        <button type="button" className={cn(base, "bg-white dark:bg-[#0b1220]")} disabled={page >= pageCount} onClick={() => go(page + 1)} aria-label="Następna strona">
          ›
        </button>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <form
          className="flex items-center gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            const value = Number(jump);
            if (Number.isFinite(value) && value >= 1) go(Math.floor(value));
            setJump("");
          }}
        >
          <label className="text-zinc-500" htmlFor="patients-jump">
            Idź do
          </label>
          <input
            id="patients-jump"
            inputMode="numeric"
            value={jump}
            onChange={(event) => setJump(event.target.value.replace(/\D/g, ""))}
            placeholder={String(page)}
            className="h-9 w-14 rounded-lg border bg-white px-2 text-center dark:bg-[#0b1220]"
          />
          <button type="submit" className={cn(base, "bg-white dark:bg-[#0b1220]")}>
            OK
          </button>
        </form>
        <select
          value={pageSize}
          onChange={(event) => onPageSize(Number(event.target.value))}
          className="h-9 rounded-lg border bg-white px-2 dark:bg-[#0b1220]"
          aria-label="Liczba pacjentów na stronie"
        >
          {[10, 25, 50, 100].map((size) => (
            <option key={size} value={size}>
              {size} / str.
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

export default function AdminPatientsPage() {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [quickSort, setQuickSort] = useState<QuickSort>("all");
  const [showAddForm, setShowAddForm] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [emailFilter, setEmailFilter] = useState<"all" | "with" | "without">("all");
  const [onlyWithNote, setOnlyWithNote] = useState(false);
  const [segmentFilter, setSegmentFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Wyszukiwanie z krótkim opóźnieniem, żeby nie pytać serwera po każdej literze.
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQ(q), 300);
    return () => window.clearTimeout(timer);
  }, [q]);

  // Zmiana wyszukiwania, filtrów lub sortowania wraca na pierwszą stronę.
  useEffect(() => {
    setPage(1);
  }, [debouncedQ, emailFilter, onlyWithNote, segmentFilter, sortDirection, sortKey, pageSize]);

  const query = new URLSearchParams({
    q: debouncedQ,
    page: String(page),
    pageSize: String(pageSize),
    sort: sortKey,
    dir: sortDirection,
    email: emailFilter,
    note: onlyWithNote ? "1" : "0",
    segment: segmentFilter,
  }).toString();
  const { data, mutate, isLoading } = useSWR(`/api/admin/patients?${query}`, fetcher, { keepPreviousData: true });
  const patients: Patient[] = data?.patients ?? [];
  const sortedPatients = patients;
  const total: number = data?.total ?? 0;
  const totalAll: number = data?.totalAll ?? 0;
  const pageCount: number = data?.pageCount ?? 1;
  const currentPage: number = data?.page ?? page;
  const isAdmin = data?.viewerRole === "ADMIN";

  const { data: changeRequestsData } = useSWR("/api/admin/patient-data-change-requests", fetcher);
  const pendingChangeRequests =
    (changeRequestsData?.requests ?? []).filter((r: { status: string }) => r.status === "PENDING").length;

  const { data: imageConsentData } = useSWR("/api/admin/image-consent-requests", fetcher);
  const pendingImageConsentRequests =
    (imageConsentData?.requests ?? []).filter((r: { status: string }) => r.status === "PENDING").length;

  // „Najlepsi” pacjenci liczeni na serwerze z całej historii, niezależnie od wyszukiwania i filtrów.
  const topVisits: { id: string; name: string; completedVisits?: number } | null = data?.top?.visits ?? null;
  const topSpender: { id: string; name: string; totalSpent?: number } | null = data?.top?.spender ?? null;

  const activeFilterCount = (emailFilter === "all" ? 0 : 1) + (onlyWithNote ? 1 : 0) + (segmentFilter === "all" ? 0 : 1);

  function applyQuickSort(next: QuickSort) {
    setQuickSort(next);
    setSortDirection("desc");
    setSortKey(next === "all" ? "createdAt" : next);
  }

  function applyMobileSort(value: string) {
    const [nextKey, nextDirection] = value.split(":") as [SortKey, SortDirection];
    setSortKey(nextKey);
    setSortDirection(nextDirection);
    setQuickSort(
      nextDirection === "desc" && ["lastVisitAt", "completedVisits", "totalSpent"].includes(nextKey)
        ? (nextKey as QuickSort)
        : nextKey === "createdAt" && nextDirection === "desc"
          ? "all"
          : "all",
    );
  }

  function changeSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === "desc" ? "asc" : "desc"));
      return;
    }
    setSortKey(nextKey);
    setSortDirection("desc");
  }

  function sortIcon(key: SortKey) {
    if (sortKey !== key) return <ArrowUpDown className="h-3.5 w-3.5" />;
    return sortDirection === "desc" ? (
      <ArrowDown className="h-3.5 w-3.5" />
    ) : (
      <ArrowUp className="h-3.5 w-3.5" />
    );
  }

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [fixingPhones, setFixingPhones] = useState(false);

  async function fixPhonePrefixes() {
    setFixingPhones(true);
    try {
      const res = await fetch("/api/admin/patients/fix-phone-prefix", { method: "POST" });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out?.ok) return toast.error(out?.message || "Nie udało się naprawić numerów");
      toast.success(
        out.fixed > 0
          ? `Naprawiono ${out.fixed} numerów telefonów z podwójnym prefiksem +48`
          : "Nie znaleziono numerów do naprawy",
      );
      mutate();
    } finally {
      setFixingPhones(false);
    }
  }

  async function create() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/patients", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, phone, email, note }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out?.ok) return toast.error(out?.message || "Błąd");
      toast.success("Pacjent dodany");
      setName("");
      setPhone("");
      setEmail("");
      setNote("");
      setShowAddForm(false);
      mutate();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-w-0 space-y-5 md:space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Pacjenci</h1>
          <div className="mt-0.5 text-sm text-zinc-500 md:hidden">
            {totalAll} {totalAll === 1 ? "pacjent" : "pacjentów"}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin ? (
            <Link
              href="/admin/patients/dedupe"
              className="hidden shrink-0 items-center rounded-xl border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900 md:inline-flex"
            >
              Duplikaty
            </Link>
          ) : null}
          {isAdmin ? (
            <Link
              href="/admin/patients/retention"
              className="hidden shrink-0 items-center rounded-xl border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900 md:inline-flex"
            >
              Do brakowania
            </Link>
          ) : null}
          <Link
            href="/admin/patients/data-change-requests"
            className="relative inline-flex shrink-0 items-center rounded-xl border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            Prośby o zmiany danych
            {pendingChangeRequests > 0 ? (
              <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-600 px-1 text-[11px] font-bold text-white">
                {pendingChangeRequests}
              </span>
            ) : null}
          </Link>
          <Link
            href="/admin/patients/image-consent-requests"
            className="relative inline-flex shrink-0 items-center rounded-xl border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            Zgody na wizerunek
            {pendingImageConsentRequests > 0 ? (
              <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-600 px-1 text-[11px] font-bold text-white">
                {pendingImageConsentRequests}
              </span>
            ) : null}
          </Link>
          {isAdmin ? (
            <button
              type="button"
              onClick={fixPhonePrefixes}
              disabled={fixingPhones}
              className="hidden shrink-0 items-center rounded-xl border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900 md:inline-flex"
              title="Naprawia numery telefonów zapisane z podwójnym prefiksem +48 (błąd starej rejestracji), które uniemożliwiały logowanie"
            >
              {fixingPhones ? "Naprawiam…" : "Napraw numery +4848…"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setShowAddForm((current) => !current)}
            className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white shadow-sm transition hover:bg-emerald-700 md:hidden"
            aria-label={showAddForm ? "Zamknij formularz" : "Dodaj pacjenta"}
          >
            {showAddForm ? <X className="h-6 w-6" /> : <Plus className="h-7 w-7" />}
          </button>
        </div>
      </div>

      {isAdmin ? (
        <div className="grid grid-cols-2 gap-3 md:gap-4">
          <Card className="min-w-0 p-4 md:p-5">
            <div className="text-sm text-zinc-500">Najwięcej wizyt</div>
            {topVisits && (topVisits.completedVisits ?? 0) > 0 ? (
              <>
                <div className="mt-2 truncate text-lg font-semibold md:text-2xl">
                  <Link
                    className="underline underline-offset-2"
                    href={`/admin/patients/${topVisits.id}`}
                    title={topVisits.name}
                  >
                    {topVisits.name}
                  </Link>
                </div>
                <div className="mt-1 text-sm text-zinc-500">
                  {topVisits.completedVisits}{" "}
                  {topVisits.completedVisits === 1 ? "wizyta" : "wizyty"}
                </div>
              </>
            ) : (
              <div className="mt-2 text-sm text-zinc-500">Brak danych.</div>
            )}
          </Card>
          <Card className="min-w-0 p-4 md:p-5">
            <div className="text-sm text-zinc-500">Najwięcej wydał</div>
            {topSpender && (topSpender.totalSpent ?? 0) > 0 ? (
              <>
                <div className="mt-2 truncate text-lg font-semibold md:text-2xl">
                  <Link
                    className="underline underline-offset-2"
                    href={`/admin/patients/${topSpender.id}`}
                    title={topSpender.name}
                  >
                    {topSpender.name}
                  </Link>
                </div>
                <div className="mt-1 text-sm text-emerald-700 dark:text-emerald-300">
                  {formatPLNFromGrosze(topSpender.totalSpent ?? 0)}
                </div>
              </>
            ) : (
              <div className="mt-2 text-sm text-zinc-500">Brak danych.</div>
            )}
          </Card>
        </div>
      ) : null}

      <Card className={cn("space-y-4 p-4", !showAddForm && "hidden md:block")}>
        <div className="font-medium">Dodaj pacjenta</div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Imię i nazwisko</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Telefon</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Notatka</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <Button onClick={create} disabled={!name || saving}>
          {saving ? "Zapisywanie..." : "Dodaj"}
        </Button>
      </Card>

      <section className="space-y-4 md:hidden">
        <div className="flex min-w-0 gap-2.5">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />
            <Input
              className="h-12 rounded-2xl pl-11 text-base"
              placeholder="Szukaj nazwiska, telefonu lub e-maila..."
              value={q}
              onChange={(event) => setQ(event.target.value)}
            />
          </div>
          <button
            type="button"
            onClick={() => setShowFilters((current) => !current)}
            className={cn(
              "relative inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border bg-white text-zinc-600 shadow-sm dark:bg-[#0b1220] dark:text-zinc-200",
              showFilters && "border-emerald-400 text-emerald-700 dark:text-emerald-300",
            )}
            aria-label="Filtry pacjentów"
          >
            <SlidersHorizontal className="h-5 w-5" />
            {activeFilterCount > 0 ? (
              <span className="absolute -right-1.5 -top-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-600 px-1 text-[11px] font-bold text-white">
                {activeFilterCount}
              </span>
            ) : null}
          </button>
        </div>

        {showFilters ? (
          <Card className="space-y-3 p-4">
            <div className="text-sm font-semibold">Filtry listy</div>
            <div className="flex flex-wrap gap-2">
              {[
                { value: "all", label: "Każdy e-mail" },
                { value: "with", label: "Z e-mailem" },
                { value: "without", label: "Bez e-maila" },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setEmailFilter(option.value as "all" | "with" | "without")}
                  className={cn(
                    "rounded-full border px-3 py-2 text-sm font-medium",
                    emailFilter === option.value
                      ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200"
                      : "bg-white text-zinc-600 dark:bg-[#0b1220] dark:text-zinc-300",
                  )}
                >
                  {option.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setOnlyWithNote((current) => !current)}
                className={cn(
                  "rounded-full border px-3 py-2 text-sm font-medium",
                  onlyWithNote
                    ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200"
                    : "bg-white text-zinc-600 dark:bg-[#0b1220] dark:text-zinc-300",
                )}
              >
                Tylko z notatką
              </button>
            </div>
            {isAdmin ? (
              <div className="space-y-2 border-t pt-3">
                <div className="text-xs font-medium text-zinc-500">Segment pacjenta (RFM)</div>
                <div className="flex flex-wrap gap-2">
                  {[{ value: "all", label: "Wszystkie segmenty" }, ...RFM_SEGMENT_FILTER_OPTIONS].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setSegmentFilter(option.value)}
                      className={cn(
                        "rounded-full border px-3 py-2 text-sm font-medium",
                        segmentFilter === option.value
                          ? "border-indigo-300 bg-indigo-50 text-indigo-800 dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-200"
                          : "bg-white text-zinc-600 dark:bg-[#0b1220] dark:text-zinc-300",
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </Card>
        ) : null}

        <div className="-mx-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex w-max gap-2.5">
            {[
              { value: "all", label: "Wszyscy" },
              { value: "lastVisitAt", label: "Ostatnia wizyta" },
              { value: "completedVisits", label: "Najwięcej wizyt" },
              ...(isAdmin ? [{ value: "totalSpent", label: "Najwięcej wydali" }] : []),
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => applyQuickSort(option.value as QuickSort)}
                className={cn(
                  "rounded-full border px-4 py-2.5 text-sm font-medium transition",
                  quickSort === option.value
                    ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200"
                    : "bg-white text-zinc-600 dark:bg-[#0b1220] dark:text-zinc-300",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-end justify-between gap-3 border-t pt-4">
          <div>
            <h2 className="text-lg font-semibold">Lista pacjentów</h2>
            <div className="mt-0.5 text-sm text-zinc-500">
              {total} {total === 1 ? "wynik" : "wyników"}
            </div>
          </div>
          <Select value={`${sortKey}:${sortDirection}`} onValueChange={applyMobileSort}>
            <SelectTrigger className="h-11 w-[148px] rounded-2xl bg-white dark:bg-[#0b1220]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="w-[200px]">
              <SelectItem value="name:asc">Nazwa A–Z</SelectItem>
              <SelectItem value="name:desc">Nazwa Z–A</SelectItem>
              <SelectItem value="createdAt:desc">Najnowsi</SelectItem>
              <SelectItem value="lastVisitAt:desc">Ostatnia wizyta</SelectItem>
              <SelectItem value="completedVisits:desc">Najwięcej wizyt</SelectItem>
              {isAdmin ? <SelectItem value="totalSpent:desc">Najwięcej wydali</SelectItem> : null}
              {isAdmin ? <SelectItem value="rfmSegment:asc">Segment RFM</SelectItem> : null}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-3">
          {isLoading ? (
            <Card className="p-5 text-center text-sm text-zinc-500">Ładowanie…</Card>
          ) : null}
          {!isLoading && sortedPatients.length === 0 ? (
            <Card className="p-5 text-center text-sm text-zinc-500">Brak wyników.</Card>
          ) : null}
          {sortedPatients.map((patient) => (
            <Link
              key={patient.id}
              href={`/admin/patients/${patient.id}`}
              className="block rounded-2xl border bg-white p-4 shadow-sm transition active:scale-[0.99] dark:bg-[#0b1220]"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div
                  className={cn(
                    "inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-base font-semibold",
                    avatarTone(patient.name),
                  )}
                >
                  {initials(patient.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="truncate text-base font-semibold text-zinc-950 dark:text-zinc-50">
                      {patient.name}
                    </div>
                    <RfmSegmentBadge segment={patient.rfmSegment} />
                  </div>
                  <div className="mt-1 space-y-0.5 text-sm text-zinc-500 dark:text-zinc-400">
                    <div className="flex min-w-0 items-center gap-2">
                      <Phone className="h-4 w-4 shrink-0" />
                      <span className="truncate">{patient.phone || "—"}</span>
                    </div>
                    <div className="flex min-w-0 items-center gap-2">
                      <Mail className="h-4 w-4 shrink-0" />
                      <span className="truncate">{patient.email || "—"}</span>
                    </div>
                  </div>
                </div>
                <div className="ml-auto flex shrink-0 flex-col items-end self-stretch">
                  <span className="whitespace-nowrap text-xs text-zinc-500 dark:text-zinc-400">
                    {patient.lastVisitAt
                      ? new Intl.DateTimeFormat("pl-PL", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                        }).format(new Date(patient.lastVisitAt))
                      : "Brak wizyty"}
                  </span>
                  <div className="mt-auto flex items-center gap-1">
                    {patient.note?.trim() ? (
                      <span
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-zinc-500 dark:text-zinc-300"
                        title={patient.note}
                      >
                        <MessageSquareText className="h-4 w-4" />
                      </span>
                    ) : null}
                    <ChevronRight className="h-5 w-5 shrink-0 text-zinc-500" />
                  </div>
                </div>
              </div>
              <div
                className={cn(
                  "mt-3 grid border-t pt-3 text-sm",
                  isAdmin ? "grid-cols-2" : "grid-cols-1",
                )}
              >
                {isAdmin ? (
                  <div className="border-r pr-3">
                    <span className="text-zinc-500">Wydano</span>
                    <span className="ml-2 font-semibold text-emerald-700 dark:text-emerald-300">
                      {formatPLNFromGrosze(patient.totalSpent ?? 0)}
                    </span>
                  </div>
                ) : null}
                <div className={cn("text-right", isAdmin && "pl-3")}>
                  <span className="text-zinc-500">Wizyty</span>
                  <span className="ml-2 font-semibold">{patient.completedVisits ?? 0}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>

        <Pagination page={currentPage} pageCount={pageCount} total={total} pageSize={pageSize} onPage={setPage} onPageSize={setPageSize} />
      </section>

      <div className="hidden rounded-xl border bg-white shadow-sm dark:bg-zinc-950 md:block">
        <div className="flex items-center gap-3 border-b p-4">
          <div className="font-medium">Lista</div>
          <Input
            className="max-w-sm"
            placeholder="Szukaj: nazwisko, telefon, email"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {isLoading && <div className="text-sm text-zinc-500">Ładowanie…</div>}
        </div>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-zinc-500">
              <tr>
                <th className="p-3">Nazwa</th>
                <th className="p-3">Telefon</th>
                <th className="p-3">Email</th>
                <th className="p-3">Notatka</th>
                {isAdmin ? (
                  <th className="p-3">
                    <button
                      type="button"
                      onClick={() => changeSort("totalSpent")}
                      className="inline-flex items-center gap-1.5 font-medium hover:text-zinc-900 dark:hover:text-white"
                    >
                      Wydano łącznie
                      {sortIcon("totalSpent")}
                    </button>
                  </th>
                ) : null}
                <th className="p-3">
                  <button
                    type="button"
                    onClick={() => changeSort("completedVisits")}
                    className="inline-flex items-center gap-1.5 font-medium hover:text-zinc-900 dark:hover:text-white"
                  >
                    Wykonane wizyty
                    {sortIcon("completedVisits")}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {patients.length === 0 && !isLoading && (
                <tr>
                  <td className="p-3 text-zinc-500" colSpan={isAdmin ? 6 : 5}>
                    Brak wyników.
                  </td>
                </tr>
              )}
              {sortedPatients.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="p-3 font-medium">
                    <Link className="underline" href={`/admin/patients/${p.id}`}>
                      {p.name}
                    </Link>{" "}
                    <RfmSegmentBadge segment={p.rfmSegment} />
                  </td>
                  <td className="p-3">{p.phone ?? "—"}</td>
                  <td className="p-3">{p.email ?? "—"}</td>
                  <td className="p-3">{p.note ?? "—"}</td>
                  {isAdmin ? (
                    <td className="p-3 font-medium text-emerald-700 dark:text-emerald-300">
                      {formatPLNFromGrosze(p.totalSpent ?? 0)}
                    </td>
                  ) : null}
                  <td className="p-3 font-medium">{p.completedVisits ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={currentPage} pageCount={pageCount} total={total} pageSize={pageSize} onPage={setPage} onPageSize={setPageSize} />
      </div>
    </div>
  );
}
