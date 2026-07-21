"use client";

import useSWR from "swr";
import { useEffect, useMemo, useState } from "react";
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
};

type SortKey = "name" | "createdAt" | "lastVisitAt" | "totalSpent" | "completedVisits";
type SortDirection = "asc" | "desc";
type QuickSort = "all" | "lastVisitAt" | "completedVisits" | "totalSpent";

const MOBILE_PAGE_SIZE = 12;

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

export default function AdminPatientsPage() {
  const [q, setQ] = useState("");
  const { data, mutate, isLoading } = useSWR(
    `/api/admin/patients?q=${encodeURIComponent(q)}`,
    fetcher,
  );
  const patients: Patient[] = data?.patients ?? [];
  const isAdmin = data?.viewerRole === "ADMIN";

  // Statystyki liczone z pełnej listy (niezależnie od pola wyszukiwania)
  const { data: allData } = useSWR(`/api/admin/patients?q=`, fetcher);
  const allPatients: Patient[] = allData?.patients ?? [];
  const topVisits = useMemo(
    () =>
      allPatients.reduce<Patient | null>(
        (best, p) => ((p.completedVisits ?? 0) > (best?.completedVisits ?? 0) ? p : best),
        null,
      ),
    [allPatients],
  );
  const topSpender = useMemo(
    () =>
      allPatients.reduce<Patient | null>(
        (best, p) => ((p.totalSpent ?? 0) > (best?.totalSpent ?? 0) ? p : best),
        null,
      ),
    [allPatients],
  );
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [quickSort, setQuickSort] = useState<QuickSort>("all");
  const [showAddForm, setShowAddForm] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [emailFilter, setEmailFilter] = useState<"all" | "with" | "without">("all");
  const [onlyWithNote, setOnlyWithNote] = useState(false);
  const [visibleCount, setVisibleCount] = useState(MOBILE_PAGE_SIZE);

  const activeFilterCount = (emailFilter === "all" ? 0 : 1) + (onlyWithNote ? 1 : 0);

  const sortedPatients = useMemo(() => {
    const filtered = patients.filter((patient) => {
      if (emailFilter === "with" && !patient.email) return false;
      if (emailFilter === "without" && patient.email) return false;
      if (onlyWithNote && !patient.note?.trim()) return false;
      return true;
    });

    return [...filtered].sort((left, right) => {
      if (sortKey === "name") {
        const result = left.name.localeCompare(right.name, "pl", { sensitivity: "base" });
        return sortDirection === "asc" ? result : -result;
      }
      const leftValue =
        sortKey === "createdAt"
          ? new Date(left.createdAt).getTime()
          : sortKey === "lastVisitAt"
            ? left.lastVisitAt
              ? new Date(left.lastVisitAt).getTime()
              : 0
            : (left[sortKey] ?? 0);
      const rightValue =
        sortKey === "createdAt"
          ? new Date(right.createdAt).getTime()
          : sortKey === "lastVisitAt"
            ? right.lastVisitAt
              ? new Date(right.lastVisitAt).getTime()
              : 0
            : (right[sortKey] ?? 0);
      return sortDirection === "asc" ? leftValue - rightValue : rightValue - leftValue;
    });
  }, [emailFilter, onlyWithNote, patients, sortDirection, sortKey]);

  useEffect(() => {
    setVisibleCount(MOBILE_PAGE_SIZE);
  }, [emailFilter, onlyWithNote, q, sortDirection, sortKey]);

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
            {allPatients.length} {allPatients.length === 1 ? "pacjent" : "pacjentów"}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowAddForm((current) => !current)}
          className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white shadow-sm transition hover:bg-emerald-700 md:hidden"
          aria-label={showAddForm ? "Zamknij formularz" : "Dodaj pacjenta"}
        >
          {showAddForm ? <X className="h-6 w-6" /> : <Plus className="h-7 w-7" />}
        </button>
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
              {sortedPatients.length} {sortedPatients.length === 1 ? "wynik" : "wyników"}
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
          {sortedPatients.slice(0, visibleCount).map((patient) => (
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
                  <div className="truncate text-base font-semibold text-zinc-950 dark:text-zinc-50">
                    {patient.name}
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
              <div className="mt-3 grid grid-cols-2 border-t pt-3 text-sm">
                {isAdmin ? (
                  <div className="border-r pr-3">
                    <span className="text-zinc-500">Wydano</span>
                    <span className="ml-2 font-semibold text-emerald-700 dark:text-emerald-300">
                      {formatPLNFromGrosze(patient.totalSpent ?? 0)}
                    </span>
                  </div>
                ) : (
                  <div className="border-r pr-3">
                    <span className="text-zinc-500">Ostatnia wizyta</span>
                    <span className="ml-2 font-medium">
                      {patient.lastVisitAt
                        ? new Intl.DateTimeFormat("pl-PL", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                          }).format(new Date(patient.lastVisitAt))
                        : "—"}
                    </span>
                  </div>
                )}
                <div className="pl-3 text-right">
                  <span className="text-zinc-500">Wizyty</span>
                  <span className="ml-2 font-semibold">{patient.completedVisits ?? 0}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {visibleCount < sortedPatients.length ? (
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full rounded-2xl"
            onClick={() => setVisibleCount((current) => current + MOBILE_PAGE_SIZE)}
          >
            Pokaż więcej
          </Button>
        ) : null}
        <div className="pb-1 text-center text-sm text-zinc-500">
          Wyświetlono {Math.min(visibleCount, sortedPatients.length)} z {sortedPatients.length}
        </div>
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
                    </Link>
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
      </div>
    </div>
  );
}
