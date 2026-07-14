
"use client";

import * as React from "react";
import Link from "next/link";
import useSWR from "swr";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  specialization?: string | null;
  sourceProfileUrl?: string | null;
};

type FinancialRange = "today" | "7d" | "30d" | "custom";

type FinancialRow = {
  specialistId: string;
  specialistCode?: number | null;
  name: string;
  avatarUrl?: string | null;
  jobTitle?: string | null;
  revenue: number;
  materialCost: number;
  appointmentsCount: number;
  payout: number;
  missingRateCount: number;
};

function Avatar({ name, avatarUrl }: { name: string; avatarUrl?: string | null }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  if (avatarUrl) {
    return <img src={avatarUrl} alt={name} className="h-12 w-12 rounded-2xl object-cover ring-1 ring-black/5" />;
  }

  return (
    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-sm font-semibold text-emerald-800 ring-1 ring-black/5">
      {initials}
    </div>
  );
}

export default function SpecialistsPage() {
  const { data, mutate, isLoading } = useSWR("/api/admin/specialists", fetcher);
  const specialists: Specialist[] = data?.specialists ?? [];

  const [activeTab, setActiveTab] = React.useState<"list" | "settlements">("list");
  const [editing, setEditing] = React.useState<Specialist | null>(null);

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Specjaliści</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Profile specjalistów i pracowników recepcji z gotowymi kontami logowania do panelu.
        </p>
      </div>

      <div className="inline-flex flex-wrap rounded-2xl border border-white/60 bg-white/70 p-1 shadow-sm dark:border-white/10 dark:bg-[#0b1220]/55">
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
          Lista Specjalistów
        </button>
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
          Rozliczenia Specjalistów
        </button>
      </div>

      {activeTab === "list" ? (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="p-4">
              <div className="text-sm text-slate-500">Łączna liczba profili</div>
              <div className="mt-2 text-3xl font-semibold">{specialists.length}</div>
            </Card>
            <Card className="p-4">
              <div className="text-sm text-slate-500">Widoczne profile</div>
              <div className="mt-2 text-3xl font-semibold">{visibleCount}</div>
            </Card>
            <Card className="p-4">
              <div className="text-sm text-slate-500">Aktualnie dostępni</div>
              <div className="mt-2 text-3xl font-semibold">{availableCount}</div>
            </Card>
          </div>

          <Card className="overflow-hidden">
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

  const ranges: Array<{ key: FinancialRange; label: string }> = [
    { key: "today", label: "Dziś" },
    { key: "7d", label: "7 dni" },
    { key: "30d", label: "30 dni" },
    { key: "custom", label: "Niestandardowe" },
  ];

  return (
    <div className="space-y-4">
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
            Przychód pochodzi z kwot wizyt, koszt preparatów ze zużyć zapisanych podczas wizyt, a wypłata ze stawek specjalisty pomniejszonych o preparaty.
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
                            {row.missingRateCount > 0 ? (
                              <div className="mt-1 text-xs text-amber-600">
                                Brak stawki dla {row.missingRateCount} zabiegów
                              </div>
                            ) : null}
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
  const [location, setLocation] = React.useState("");
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
    setLocation(specialist.location ?? "");
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
        location,
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
            <Input value={location} onChange={(e) => setLocation(e.target.value)} />
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
