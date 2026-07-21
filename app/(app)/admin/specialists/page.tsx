"use client";

import * as React from "react";
import { useAuth } from "@/components/auth-provider";
import Link from "next/link";
import useSWR from "swr";
import { toast } from "sonner";
import { ArrowRight, CalendarDays, Eye, EyeOff, MoreHorizontal, SlidersHorizontal } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LocationSelect } from "@/components/location-select";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { formatPLNFromGrosze } from "@/lib/money";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Specialist = {
  id: string;
  specialistCode?: number | null;
  name: string;
  login: string;
  role: string;
  email?: string | null;
  phone?: string | null;
  isVisible: boolean;
  isAvailable: boolean;
  avatarUrl?: string | null;
  jobTitle?: string | null;
  location?: string | null;
  locationId: string;
  specialization?: string | null;
  sourceProfileUrl?: string | null;
};

type FinancialRange = "today" | "7d" | "30d" | "month" | "custom";
type MobileSpecialistFilter = "all" | "available" | "unavailable" | "hidden";
type MobileSpecialistRole = "all" | "specialist" | "reception";
type MobileSettlementSort = "revenue" | "payout" | "name";

type FinancialRow = {
  specialistId: string;
  specialistCode?: number | null;
  name: string;
  avatarUrl?: string | null;
  jobTitle?: string | null;
  payoutPercent?: number | null;
  revenue: number;
  materialCost: number;
  appointmentsCount: number;
  payout: number;
};

function Avatar({ name, avatarUrl, large = false }: { name: string; avatarUrl?: string | null; large?: boolean }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className={`${large ? "h-16 w-16 rounded-full" : "h-12 w-12 rounded-2xl"} object-cover ring-1 ring-black/5`}
      />
    );
  }

  return (
    <div className={`flex ${large ? "h-16 w-16 rounded-full text-lg" : "h-12 w-12 rounded-2xl text-sm"} items-center justify-center bg-emerald-100 font-semibold text-emerald-800 ring-1 ring-black/5`}>
      {initials}
    </div>
  );
}

export default function SpecialistsPage() {
  const { data, mutate, isLoading } = useSWR("/api/admin/specialists", fetcher);
  const specialists: Specialist[] = data?.specialists ?? [];

  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const [activeTab, setActiveTab] = React.useState<"list" | "settlements">("list");
  React.useEffect(() => {
    if (!isAdmin && activeTab === "settlements") setActiveTab("list");
  }, [isAdmin, activeTab]);
  const [editing, setEditing] = React.useState<Specialist | null>(null);
  const [mobileQuery, setMobileQuery] = React.useState("");
  const [mobileFilter, setMobileFilter] = React.useState<MobileSpecialistFilter>("all");
  const [mobileRole, setMobileRole] = React.useState<MobileSpecialistRole>("all");
  const [mobileSortDescending, setMobileSortDescending] = React.useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = React.useState(false);

  async function toggleField(id: string, patch: Partial<Pick<Specialist, "isVisible" | "isAvailable">>) {
    const res = await fetch(`/api/admin/specialists/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || !out?.ok) return toast.error(out?.message || "Nie udało się zapisać zmian");
    toast.success("Zapisano zmiany");
    mutate();
  }

  const visibleCount = specialists.filter((s) => s.isVisible).length;
  const availableCount = specialists.filter((s) => s.isAvailable).length;
  const unavailableCount = specialists.filter((s) => !s.isAvailable).length;
  const hiddenCount = specialists.filter((s) => !s.isVisible).length;

  const mobileSpecialists = React.useMemo(() => {
    const normalizedQuery = mobileQuery.trim().toLocaleLowerCase("pl");
    return specialists
      .filter((specialist) => {
        if (mobileFilter === "available" && !specialist.isAvailable) return false;
        if (mobileFilter === "unavailable" && specialist.isAvailable) return false;
        if (mobileFilter === "hidden" && specialist.isVisible) return false;
        if (mobileRole === "specialist" && specialist.role === "RECEPTION") return false;
        if (mobileRole === "reception" && specialist.role !== "RECEPTION") return false;
        if (!normalizedQuery) return true;
        return `${specialist.name} ${specialist.jobTitle ?? ""} ${specialist.specialization ?? ""}`
          .toLocaleLowerCase("pl")
          .includes(normalizedQuery);
      })
      .sort((first, second) => {
        const result = first.name.localeCompare(second.name, "pl", { sensitivity: "base" });
        return mobileSortDescending ? -result : result;
      });
  }, [mobileFilter, mobileQuery, mobileRole, mobileSortDescending, specialists]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Specjaliści</h1>
        <p className="mt-1 text-sm text-slate-500 sm:hidden">
          {activeTab === "list" ? `${specialists.length} profili` : "Rozliczenia"}
        </p>
        <p className="mt-1 hidden text-sm text-slate-600 dark:text-slate-300 sm:block">
          Profile specjalistów i pracowników recepcji z gotowymi kontami logowania do panelu.
        </p>
      </div>

      <div className="grid w-full grid-cols-2 rounded-2xl border border-white/60 bg-white/70 p-1 shadow-sm dark:border-white/10 dark:bg-[#0b1220]/55 sm:inline-flex sm:w-auto sm:flex-wrap">
        <button
          type="button"
          onClick={() => setActiveTab("list")}
          className={
            "rounded-xl px-4 py-2 text-sm font-semibold transition " +
            (activeTab === "list"
              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200"
              : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5")
          }
        >
          <span className="sm:hidden">Lista specjalistów</span>
          <span className="hidden sm:inline">Lista Specjalistów</span>
        </button>
        {isAdmin ? (
        <button
          type="button"
          onClick={() => setActiveTab("settlements")}
          className={
            "rounded-xl px-4 py-2 text-sm font-semibold transition " +
            (activeTab === "settlements"
              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200"
              : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5")
          }
        >
          <span className="sm:hidden">Rozliczenia</span>
          <span className="hidden sm:inline">Rozliczenia Specjalistów</span>
        </button>
        ) : null}
      </div>

      {activeTab === "list" || !isAdmin ? (
        <>
          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            <Card className="p-3 sm:p-4">
              <div className="text-xs leading-tight text-slate-500 sm:text-sm">Łączna liczba profili</div>
              <div className="mt-2 text-2xl font-semibold sm:text-3xl">{specialists.length}</div>
            </Card>
            <Card className="p-3 sm:p-4">
              <div className="text-xs leading-tight text-slate-500 sm:text-sm">Widoczne profile</div>
              <div className="mt-2 text-2xl font-semibold sm:text-3xl">{visibleCount}</div>
            </Card>
            <Card className="p-3 sm:p-4">
              <div className="text-xs leading-tight text-slate-500 sm:text-sm">Aktualnie dostępni</div>
              <div className="mt-2 text-2xl font-semibold sm:text-3xl">{availableCount}</div>
            </Card>
          </div>

          <section className="space-y-4 sm:hidden">
            <div className="flex items-stretch gap-2">
              <Input
                value={mobileQuery}
                onChange={(event) => setMobileQuery(event.target.value)}
                placeholder="Szukaj specjalisty..."
                className="min-w-0 flex-1 rounded-xl"
              />
              <Button
                type="button"
                variant="outline"
                className="relative h-10 w-11 shrink-0 px-0"
                onClick={() => setMobileFiltersOpen((open) => !open)}
                aria-label="Pokaż filtry specjalistów"
              >
                <SlidersHorizontal className="h-4 w-4" />
                {mobileRole !== "all" ? (
                  <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-600 px-1 text-[10px] font-semibold text-white">
                    1
                  </span>
                ) : null}
              </Button>
            </div>

            {mobileFiltersOpen ? (
              <Card className="space-y-4 border-slate-200 bg-white p-4 shadow-lg dark:border-white/10 dark:bg-zinc-950">
                <div className="space-y-2">
                  <Label>Typ profilu</Label>
                  <Select value={mobileRole} onValueChange={(value) => setMobileRole(value as MobileSpecialistRole)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-2rem)] !bg-white dark:!bg-zinc-950">
                      <SelectItem value="all">Wszystkie profile</SelectItem>
                      <SelectItem value="specialist">Specjaliści</SelectItem>
                      <SelectItem value="reception">Recepcja</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setMobileRole("all")}
                    disabled={mobileRole === "all"}
                  >
                    Wyczyść filtr
                  </Button>
                  <Button type="button" size="sm" onClick={() => setMobileFiltersOpen(false)}>
                    Pokaż wyniki
                  </Button>
                </div>
              </Card>
            ) : null}

            <div className="grid grid-cols-4 gap-2">
              {([
                ["all", "Wszyscy", specialists.length],
                ["available", "Dostępni", availableCount],
                ["unavailable", "Niedostępni", unavailableCount],
                ["hidden", "Ukryci", hiddenCount],
              ] as const).map(([value, label, count]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMobileFilter(value)}
                  className={
                    "min-w-0 rounded-xl border px-1.5 py-2 text-center transition-colors " +
                    (mobileFilter === value
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-200"
                      : "border-slate-200 bg-white text-slate-600 dark:border-white/10 dark:bg-zinc-950 dark:text-slate-300")
                  }
                >
                  <span className="block text-[10px] font-medium leading-tight">{label}</span>
                  <span className="mt-1 block text-[10px] opacity-70">{count}</span>
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between gap-3 px-1">
              <div>
                <h2 className="font-semibold">Lista specjalistów</h2>
                <div className="mt-0.5 text-xs text-slate-500">{mobileSpecialists.length} profili</div>
              </div>
              <button
                type="button"
                onClick={() => setMobileSortDescending((descending) => !descending)}
                className="text-xs font-medium text-slate-500 dark:text-slate-400"
              >
                Nazwa {mobileSortDescending ? "Z–A" : "A–Z"}
              </button>
            </div>

            {isLoading ? (
              <Card className="p-5 text-sm text-slate-500">Ładowanie...</Card>
            ) : mobileSpecialists.length === 0 ? (
              <Card className="p-6 text-center text-sm text-slate-500">Brak pasujących specjalistów.</Card>
            ) : (
              <div className="space-y-3">
                {mobileSpecialists.map((specialist) => (
                  <Card key={specialist.id} className="overflow-hidden p-4">
                    <div className="flex items-start gap-3">
                      <div className="shrink-0">
                        <Avatar name={specialist.name} avatarUrl={specialist.avatarUrl} large />
                      </div>
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/admin/specialists/${specialist.id}`}
                          className="break-words font-semibold leading-5 text-slate-900 dark:text-white"
                        >
                          {specialist.name}
                        </Link>
                        <div className="mt-1 break-words text-sm leading-5 text-slate-500">
                          {specialist.jobTitle || specialist.specialization || (specialist.role === "RECEPTION" ? "Recepcja" : "Specjalista")}
                        </div>
                        <Badge variant="secondary" className="mt-2">
                          {specialist.role === "RECEPTION" ? "Recepcja" : "Specjalista"}
                        </Badge>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditing(specialist)}
                          aria-label={`Edytuj: ${specialist.name}`}
                          className="flex h-8 w-8 items-center justify-center rounded-xl border text-slate-500"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                        <Link
                          href={`/admin/specialists/${specialist.id}`}
                          aria-label={`Otwórz profil: ${specialist.name}`}
                          className="flex h-8 w-8 items-center justify-center rounded-full text-slate-900 dark:text-white"
                        >
                          <ArrowRight className="h-5 w-5" />
                        </Link>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap justify-end gap-2 border-t pt-3">
                      <span className={
                        "rounded-lg px-2.5 py-1 text-xs font-medium " +
                        (specialist.isVisible
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200"
                          : "bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-slate-300")
                      }>
                        {specialist.isVisible ? "Widoczny" : "Ukryty"}
                      </span>
                      <span className={
                        "rounded-lg px-2.5 py-1 text-xs font-medium " +
                        (specialist.isAvailable
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200"
                          : "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200")
                      }>
                        {specialist.isAvailable ? "Dostępny" : "Niedostępny"}
                      </span>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </section>

          <Card className="hidden overflow-hidden sm:block">
            <div className="border-b p-4">
              <div className="font-medium">Lista Specjalistów</div>
              <div className="mt-1 text-xs text-slate-500">Każdy rekord ma utworzony login. Specjalista po zalogowaniu widzi własne wizyty w panelu specjalisty.</div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-500 dark:bg-white/5">
                  <tr>
                    <th className="p-3">ID</th>
                    <th className="p-3">Nazwa</th>
                    <th className="p-3">Widoczność</th>
                    <th className="p-3">Dostępność</th>
                    <th className="p-3">Telefon</th>
                    <th className="p-3">E-mail</th>
                    <th className="p-3">Działania</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading && (
                    <tr><td className="p-4 text-slate-500" colSpan={7}>Ładowanie...</td></tr>
                  )}
                  {!isLoading && specialists.length === 0 && (
                    <tr><td className="p-4 text-slate-500" colSpan={7}>Brak specjalistów.</td></tr>
                  )}
                  {specialists.map((s, index) => (
                    <tr key={s.id} className="border-t align-top">
                      <td className="p-3 font-medium">{s.specialistCode ?? index + 1}</td>
                      <td className="p-3">
                        <div className="flex items-start gap-3">
                          <Avatar name={s.name} avatarUrl={s.avatarUrl} />
                          <div>
                            <Link href={`/admin/specialists/${s.id}`} className="font-medium text-slate-900 hover:underline dark:text-white">
                              {s.name}
                            </Link>
                            <div className="mt-1 text-xs text-slate-500">login: {s.login}</div>
                            {s.jobTitle ? <div className="mt-1 text-xs text-slate-500">{s.jobTitle}</div> : null}
                            <div className="mt-2 flex flex-wrap gap-2">
                              <Badge variant="secondary">{s.role === "RECEPTION" ? "Recepcja" : "Specjalista"}</Badge>
                              {s.sourceProfileUrl ? (
                                <a className="text-xs text-emerald-700 underline underline-offset-2" href={s.sourceProfileUrl} target="_blank" rel="noreferrer">
                                  Profil źródłowy
                                </a>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="p-3">
                        <Badge className={s.isVisible ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100" : "bg-slate-200 text-slate-700 hover:bg-slate-200"}>
                          {s.isVisible ? "Widoczne" : "Ukryty"}
                        </Badge>
                      </td>
                      <td className="p-3">
                        <Badge className={s.isAvailable ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100" : "bg-amber-100 text-amber-800 hover:bg-amber-100"}>
                          {s.isAvailable ? "Dostępny" : "Niedostępny"}
                        </Badge>
                      </td>
                      <td className="p-3">{s.phone || "-"}</td>
                      <td className="p-3">{s.email || "-"}</td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-2">
                          <Link href={`/admin/specialists/${s.id}`}>
                            <Button size="sm" variant="outline">Szczegóły</Button>
                          </Link>
                          <Button size="sm" onClick={() => setEditing(s)}>
                            Edytuj
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => toggleField(s.id, { isVisible: !s.isVisible })}>
                            {s.isVisible ? "Ukryj" : "Pokaż"}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => toggleField(s.id, { isAvailable: !s.isAvailable })}>
                            {s.isAvailable ? "Oznacz niedostępny" : "Oznacz dostępny"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : (
        <SpecialistFinancialSettlements />
      )}

      <EditSpecialistDialog
        specialist={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          mutate();
        }}
      />
    </div>
  );
}

function toDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function SpecialistFinancialSettlements() {
  const now = React.useMemo(() => new Date(), []);
  const [range, setRange] = React.useState<FinancialRange>("30d");
  const [hideZero, setHideZero] = React.useState(true);
  const [mobileSort, setMobileSort] = React.useState<MobileSettlementSort>("revenue");
  const [from, setFrom] = React.useState(() =>
    toDateInput(new Date(now.getFullYear(), now.getMonth(), 1)),
  );
  const [to, setTo] = React.useState(() => toDateInput(now));
  const customRangeInvalid = range === "custom" && (!from || !to || from > to);

  const query = React.useMemo(() => {
    const params = new URLSearchParams({ range });
    if (range === "custom") {
      params.set("from", from);
      params.set("to", to);
    }
    return params.toString();
  }, [from, range, to]);

  const { data, isLoading, error } = useSWR(
    customRangeInvalid ? null : `/api/admin/specialists/financial-summary?${query}`,
    fetcher,
  );
  const rows: FinancialRow[] = data?.rows ?? [];
  const totals = React.useMemo(
    () =>
      rows.reduce(
        (sum, row) => ({
          revenue: sum.revenue + row.revenue,
          materialCost: sum.materialCost + row.materialCost,
          appointmentsCount: sum.appointmentsCount + row.appointmentsCount,
          payout: sum.payout + row.payout,
        }),
        { revenue: 0, materialCost: 0, appointmentsCount: 0, payout: 0 },
      ),
    [rows],
  );
  const mobileRows = React.useMemo(() => {
    const filtered = hideZero
      ? rows.filter((row) => row.revenue !== 0 || row.materialCost !== 0 || row.appointmentsCount !== 0 || row.payout !== 0)
      : rows;
    return [...filtered].sort((first, second) => {
      if (mobileSort === "name") return first.name.localeCompare(second.name, "pl", { sensitivity: "base" });
      if (mobileSort === "payout") return second.payout - first.payout;
      return second.revenue - first.revenue;
    });
  }, [hideZero, mobileSort, rows]);

  const ranges: Array<{ key: FinancialRange; label: string }> = [
    { key: "today", label: "Dziś" },
    { key: "7d", label: "7 dni" },
    { key: "30d", label: "30 dni" },
    { key: "month", label: "Ten miesiąc" },
    { key: "custom", label: "Niestandardowe" },
  ];

  return (
    <div className="space-y-4">
      <section className="space-y-5 sm:hidden">
        <div>
          <div className="font-semibold">Zakres rozliczenia</div>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {ranges.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setRange(item.key)}
                aria-label={item.label}
                className={
                  "flex h-11 shrink-0 items-center justify-center rounded-xl border px-4 text-sm font-medium transition-colors " +
                  (range === item.key
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-200"
                    : "border-slate-200 bg-white text-slate-700 dark:border-white/10 dark:bg-zinc-950 dark:text-slate-300")
                }
              >
                {item.key === "custom" ? <CalendarDays className="h-4 w-4" /> : item.label}
              </button>
            ))}
          </div>
          <div className="mt-2 text-xs text-slate-500">Tylko zakończone i zaakceptowane wizyty.</div>

          {range === "custom" ? (
            <Card className="mt-3 grid grid-cols-2 gap-3 p-3">
              <div>
                <Label htmlFor="mobile-settlements-from" className="text-xs text-slate-500">Od</Label>
                <Input
                  id="mobile-settlements-from"
                  type="date"
                  value={from}
                  onChange={(event) => setFrom(event.target.value)}
                  className="mt-1 min-w-0"
                />
              </div>
              <div>
                <Label htmlFor="mobile-settlements-to" className="text-xs text-slate-500">Do</Label>
                <Input
                  id="mobile-settlements-to"
                  type="date"
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                  className="mt-1 min-w-0"
                />
              </div>
            </Card>
          ) : null}
        </div>

        <div>
          <h2 className="font-semibold">Podsumowanie</h2>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Card className="p-4">
              <div className="text-xs text-slate-500">Przychód</div>
              <div className="mt-1 break-words text-lg font-semibold tabular-nums">{formatPLNFromGrosze(totals.revenue)}</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-slate-500">Koszt preparatów</div>
              <div className="mt-1 break-words text-lg font-semibold tabular-nums">{formatPLNFromGrosze(totals.materialCost)}</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-slate-500">Zabiegi</div>
              <div className="mt-1 text-lg font-semibold tabular-nums">{totals.appointmentsCount}</div>
            </Card>
            <Card className="border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-500/30 dark:bg-emerald-500/10">
              <div className="text-xs text-slate-500 dark:text-emerald-200/70">Wypłaty</div>
              <div className={`mt-1 break-words text-lg font-semibold tabular-nums ${totals.payout < 0 ? "text-red-600 dark:text-red-300" : "text-emerald-700 dark:text-emerald-200"}`}>
                {formatPLNFromGrosze(totals.payout)}
              </div>
            </Card>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">Rozliczenia specjalistów</h2>
              <div className="mt-0.5 text-xs text-slate-500">{mobileRows.length} specjalistów</div>
            </div>
            <Select value={mobileSort} onValueChange={(value) => setMobileSort(value as MobileSettlementSort)}>
              <SelectTrigger className="h-9 w-40 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="w-48 max-w-[calc(100vw-2rem)] !bg-white dark:!bg-zinc-950">
                <SelectItem value="revenue">Najwyższy przychód</SelectItem>
                <SelectItem value="payout">Najwyższa wypłata</SelectItem>
                <SelectItem value="name">Nazwa A–Z</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <button
            type="button"
            onClick={() => setHideZero((hidden) => !hidden)}
            className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200"
          >
            {hideZero ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {hideZero ? "Pokaż zerowe" : "Ukryj zerowe"}
          </button>

          {customRangeInvalid ? (
            <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200">
              Wybierz poprawny zakres dat.
            </Card>
          ) : isLoading ? (
            <Card className="p-5 text-sm text-slate-500">Ładowanie...</Card>
          ) : error || data?.ok === false ? (
            <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200">
              {data?.message || "Nie udało się pobrać rozliczeń."}
            </Card>
          ) : mobileRows.length === 0 ? (
            <Card className="p-6 text-center text-sm text-slate-500">Brak rozliczeń dla wybranego zakresu.</Card>
          ) : (
            <div className="space-y-3">
              {mobileRows.map((row) => (
                <Card key={row.specialistId} className="overflow-hidden p-4">
                  <div className="flex items-center gap-3">
                    <div className="shrink-0">
                      <Avatar name={row.name} avatarUrl={row.avatarUrl} large />
                    </div>
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/admin/specialists/${row.specialistId}`}
                        className="break-words font-semibold leading-5 text-slate-900 dark:text-white"
                      >
                        {row.name}
                      </Link>
                      {row.jobTitle ? (
                        <div className="mt-1 break-words text-sm leading-5 text-slate-500">{row.jobTitle}</div>
                      ) : null}
                    </div>
                    <Link
                      href={`/admin/specialists/${row.specialistId}`}
                      aria-label={`Otwórz rozliczenia: ${row.name}`}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-900 dark:text-white"
                    >
                      <ArrowRight className="h-5 w-5" />
                    </Link>
                  </div>
                  <div className="relative mt-3 grid grid-cols-2 overflow-hidden rounded-xl border border-slate-200 text-xs dark:border-white">
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-y-0 left-1/2 z-10 w-px -translate-x-1/2 bg-slate-200 dark:bg-white"
                    />
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-0 top-1/2 z-10 h-px -translate-y-1/2 bg-slate-200 dark:bg-white"
                    />
                    <div className="p-3">
                      <div className="text-slate-500">Przychód kliniki</div>
                      <div className="mt-1 break-words font-semibold tabular-nums">{formatPLNFromGrosze(row.revenue)}</div>
                    </div>
                    <div className="p-3">
                      <div className="text-slate-500">Preparaty</div>
                      <div className="mt-1 break-words font-semibold tabular-nums">{formatPLNFromGrosze(row.materialCost)}</div>
                    </div>
                    <div className="p-3">
                      <div className="text-slate-500">Zabiegi</div>
                      <div className="mt-1 font-semibold tabular-nums">{row.appointmentsCount}</div>
                    </div>
                    <div className="p-3">
                      <div className={row.payout < 0 ? "text-red-500" : "text-emerald-600"}>Wypłata</div>
                      <div className={`mt-1 break-words font-semibold tabular-nums ${row.payout < 0 ? "text-red-600 dark:text-red-300" : "text-emerald-700 dark:text-emerald-200"}`}>
                        {formatPLNFromGrosze(row.payout)}
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </section>

      <div className="hidden space-y-4 sm:block">
      <Card className="p-4">
        <div className="font-medium">Zakres rozliczenia</div>
        <div className="mt-1 text-xs text-slate-500">
          Zestawienie obejmuje wyłącznie zakończone wizyty i korzysta z tych samych wyliczeń co szczegóły pracownika.
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="inline-flex flex-wrap rounded-2xl bg-slate-100 p-1 dark:bg-white/5">
            {ranges.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setRange(item.key)}
                className={
                  "rounded-xl px-4 py-2 text-sm font-medium transition " +
                  (range === item.key
                    ? "bg-white text-emerald-700 shadow-sm dark:bg-emerald-500/10 dark:text-emerald-200"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white")
                }
              >
                {item.label}
              </button>
            ))}
          </div>

          {range === "custom" ? (
            <>
              <div>
                <Label htmlFor="settlements-from" className="text-xs text-slate-500">Od</Label>
                <Input
                  id="settlements-from"
                  type="date"
                  value={from}
                  onChange={(event) => setFrom(event.target.value)}
                  className="mt-1 w-44"
                />
              </div>
              <div>
                <Label htmlFor="settlements-to" className="text-xs text-slate-500">Do</Label>
                <Input
                  id="settlements-to"
                  type="date"
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                  className="mt-1 w-44"
                />
              </div>
            </>
          ) : null}

          {isLoading ? <div className="pb-2 text-sm text-slate-500">Ładowanie...</div> : null}
        </div>

        {customRangeInvalid ? (
          <div className="mt-3 text-sm text-red-600">Wybierz poprawny zakres dat.</div>
        ) : null}
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b p-4">
          <div className="font-medium">Rozliczenia Specjalistów</div>
          <div className="mt-1 text-xs text-slate-500">
            Przychód pochodzi z kwot wizyt, koszt preparatów ze zużyć zapisanych podczas wizyt, a wypłata = (przychód − preparaty) × procent pracownika. Liczą się tylko wizyty zakończone i zaakceptowane — tak samo jak w szczegółach pracownika.
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500 dark:bg-white/5">
              <tr>
                <th className="p-3">ID</th>
                <th className="p-3">Specjalista</th>
                <th className="p-3 text-right">Przychód dla kliniki</th>
                <th className="p-3 text-right">Koszt preparatów</th>
                <th className="p-3 text-right">Ilość zabiegów</th>
                <th className="p-3 text-right">Wypłata</th>
                <th className="p-3">Działania</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td className="p-4 text-slate-500" colSpan={7}>Ładowanie...</td></tr>
              ) : null}
              {!isLoading && (error || data?.ok === false) ? (
                <tr>
                  <td className="p-4 text-red-600" colSpan={7}>
                    {data?.message || "Nie udało się pobrać rozliczeń."}
                  </td>
                </tr>
              ) : null}
              {!isLoading && !error && data?.ok !== false && rows.length === 0 ? (
                <tr><td className="p-4 text-slate-500" colSpan={7}>Brak specjalistów.</td></tr>
              ) : null}
              {!isLoading && data?.ok !== false
                ? rows.map((row, index) => (
                    <tr key={row.specialistId} className="border-t align-top">
                      <td className="p-3 font-medium">{row.specialistCode ?? index + 1}</td>
                      <td className="p-3">
                        <div className="flex items-start gap-3">
                          <Avatar name={row.name} avatarUrl={row.avatarUrl} />
                          <div>
                            <Link
                              href={`/admin/specialists/${row.specialistId}`}
                              className="font-medium text-slate-900 hover:underline dark:text-white"
                            >
                              {row.name}
                            </Link>
                            {row.jobTitle ? <div className="mt-1 text-xs text-slate-500">{row.jobTitle}</div> : null}
                          </div>
                        </div>
                      </td>
                      <td className="p-3 text-right font-medium tabular-nums">{formatPLNFromGrosze(row.revenue)}</td>
                      <td className="p-3 text-right tabular-nums">{formatPLNFromGrosze(row.materialCost)}</td>
                      <td className="p-3 text-right tabular-nums">{row.appointmentsCount}</td>
                      <td className="p-3 text-right font-semibold tabular-nums">{formatPLNFromGrosze(row.payout)}</td>
                      <td className="p-3">
                        <Link href={`/admin/specialists/${row.specialistId}`}>
                          <Button size="sm" variant="outline">Szczegóły</Button>
                        </Link>
                      </td>
                    </tr>
                  ))
                : null}
            </tbody>
            {rows.length > 0 && !isLoading && data?.ok !== false ? (
              <tfoot>
                <tr className="border-t bg-slate-50 font-semibold dark:bg-white/5">
                  <td className="p-3" colSpan={2}>Suma</td>
                  <td className="p-3 text-right tabular-nums">{formatPLNFromGrosze(totals.revenue)}</td>
                  <td className="p-3 text-right tabular-nums">{formatPLNFromGrosze(totals.materialCost)}</td>
                  <td className="p-3 text-right tabular-nums">{totals.appointmentsCount}</td>
                  <td className="p-3 text-right tabular-nums">{formatPLNFromGrosze(totals.payout)}</td>
                  <td className="p-3" />
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </Card>
      </div>
    </div>
  );
}

function EditSpecialistDialog({
  specialist,
  onClose,
  onSaved,
}: {
  specialist: Specialist | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [jobTitle, setJobTitle] = React.useState("");
  const [locationId, setLocationId] = React.useState("");
  const [specialization, setSpecialization] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  // Uzupełnij formularz przy każdym otwarciu okna
  React.useEffect(() => {
    if (!specialist) return;
    setName(specialist.name ?? "");
    setPhone(specialist.phone ?? "");
    setEmail(specialist.email ?? "");
    setJobTitle(specialist.jobTitle ?? "");
    setLocationId(specialist.locationId ?? "");
    setSpecialization(specialist.specialization ?? "");
    setPassword("");
  }, [specialist]);

  async function onSave() {
    if (!specialist) return;
    if (name.trim().length < 2) return toast.error("Podaj imię i nazwisko.");
    if (password && password.length < 4) return toast.error("Nowe hasło musi mieć min. 4 znaki.");

    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        phone,
        email,
        jobTitle,
        locationId,
        specialization,
      };
      if (password) body.password = password;

      const res = await fetch(`/api/admin/users/${specialist.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out?.ok) {
        toast.error(out?.message || "Nie udało się zapisać zmian");
        return;
      }
      toast.success("Zapisano zmiany");
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!specialist} onOpenChange={(open) => (!open ? onClose() : null)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edytuj: {specialist?.name}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label>Imię i nazwisko</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Telefon</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+48..." />
            </div>
            <div className="grid gap-1.5">
              <Label>E-mail</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="adres@email.pl" />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label>Stanowisko (opis)</Label>
            <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
          </div>

          <div className="grid gap-1.5">
            <Label>Lokalizacja</Label>
            <LocationSelect value={locationId} onChange={setLocationId} />
          </div>

          <div className="grid gap-1.5">
            <Label>Specjalizacja</Label>
            <Input value={specialization} onChange={(e) => setSpecialization(e.target.value)} />
          </div>

          <div className="grid gap-1.5">
            <Label>Nowe hasło (opcjonalne)</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="zostaw puste, aby nie zmieniać"
            />
          </div>
        </div>

        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Anuluj
          </Button>
          <Button onClick={onSave} disabled={saving}>
            {saving ? "Zapisywanie..." : "Zapisz zmiany"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
