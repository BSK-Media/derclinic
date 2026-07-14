"use client";

import * as React from "react";
import useSWR from "swr";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/components/auth-provider";
import { formatPLNFromGrosze, parsePLNToGrosze } from "@/lib/money";
import {
  SIDEBAR_PERMISSION_OPTIONS,
  type SidebarPermission,
} from "@/lib/sidebar-permissions";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type RangeKey = "today" | "7d" | "30d";

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: "Zaplanowana",
  COMPLETED: "Zakończona",
  CANCELED: "Anulowana",
  NO_SHOW: "Nieobecność",
};

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "COMPLETED"
      ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
      : status === "SCHEDULED"
        ? "bg-sky-100 text-sky-800 hover:bg-sky-100"
        : status === "CANCELED"
          ? "bg-slate-200 text-slate-700 hover:bg-slate-200"
          : "bg-amber-100 text-amber-800 hover:bg-amber-100";
  return <Badge className={cls}>{STATUS_LABEL[status] ?? status}</Badge>;
}

export default function SpecialistDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [range, setRange] = React.useState<RangeKey>("30d");
  const { user } = useAuth();

  const { data, isLoading, mutate } = useSWR(`/api/admin/specialists/${id}/overview?range=${range}`, fetcher);
  const specialist = data?.specialist;
  const stats = data?.stats;
  const appointments: any[] = data?.appointments ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 overflow-hidden rounded-2xl bg-slate-200 ring-1 ring-black/5 dark:bg-white/10">
            {specialist?.avatarUrl ? (
              <img src={specialist.avatarUrl} alt={specialist.name} className="h-full w-full object-cover" />
            ) : null}
          </div>
          <div>
            <h1 className="text-2xl font-semibold">{specialist?.name ?? "Ładowanie..."}</h1>
            <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">
              {specialist?.specialization || specialist?.jobTitle || "—"}
            </p>
            <p className="text-xs text-slate-500">{specialist?.location || ""}</p>
          </div>
        </div>

        <Link href="/admin/specialists" className="text-sm text-emerald-700 underline underline-offset-2 dark:text-emerald-300">
          ← Wróć do listy
        </Link>
      </div>

      {user?.role === "ADMIN" ? (
        <SidebarPermissionsSection
          specialistId={id}
          permissions={specialist?.sidebarPermissions}
          loading={isLoading}
          onSaved={() => mutate()}
        />
      ) : null}

      {/* Filtr zakresu */}
      <div className="inline-flex rounded-2xl border border-white/60 bg-white/70 p-1 text-sm shadow-sm dark:border-white/10 dark:bg-[#0b1220]/55">
        {(
          [
            { k: "today", label: "Dziś" },
            { k: "7d", label: "7 dni" },
            { k: "30d", label: "30 dni" },
          ] as const
        ).map((x) => (
          <button
            key={x.k}
            onClick={() => setRange(x.k)}
            className={
              "rounded-2xl px-4 py-1.5 font-medium " +
              (range === x.k
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white")
            }
          >
            {x.label}
          </button>
        ))}
      </div>

      {/* Statystyki (z wizyt zakończonych) */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Card className="p-4">
          <div className="text-sm text-slate-500">Wizyty zakończone</div>
          <div className="mt-2 text-3xl font-semibold">{stats?.appointmentsCompleted ?? "—"}</div>
          <div className="mt-1 text-xs text-slate-500">wszystkie w okresie: {stats?.appointmentsTotal ?? "—"}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-slate-500">Przychód dla kliniki</div>
          <div className="mt-2 text-3xl font-semibold">{stats ? formatPLNFromGrosze(stats.revenue) : "—"}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-slate-500">Koszt materiałów</div>
          <div className="mt-2 text-3xl font-semibold">{stats ? formatPLNFromGrosze(stats.materialCost) : "—"}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-slate-500">Wynagrodzenie pracownika</div>
          <div className="mt-2 text-3xl font-semibold">{stats ? formatPLNFromGrosze(stats.payout) : "—"}</div>
          <div className="mt-1 text-xs text-slate-500">stawka za zabieg − materiały</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-slate-500">Zysk kliniki</div>
          <div className="mt-2 text-3xl font-semibold">{stats ? formatPLNFromGrosze(stats.profit) : "—"}</div>
          <div className="mt-1 text-xs text-slate-500">przychód − materiały − wynagrodzenie</div>
        </Card>
      </div>

      {stats?.missingRateCount > 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          Uwaga: {stats.missingRateCount} zakończonych wizyt nie ma przypisanej stawki (ani dla zabiegu, ani domyślnej) —
          nie są wliczone do wynagrodzenia. Ustaw stawki poniżej.
        </div>
      ) : null}

      {/* Historia wizyt */}
      <Card className="overflow-hidden">
        <div className="border-b p-4">
          <div className="font-medium">Historia wizyt</div>
          <div className="mt-1 text-xs text-slate-500">
            Kwoty: przychód (cena wizyty), materiały (koszt zakupu zużytych produktów), wypłata = stawka − materiały.
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500 dark:bg-white/5">
              <tr>
                <th className="p-3">Data</th>
                <th className="p-3">Pacjent</th>
                <th className="p-3">Zabieg</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Przychód</th>
                <th className="p-3 text-right">Materiały</th>
                <th className="p-3 text-right">Stawka</th>
                <th className="p-3 text-right">Wypłata</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td className="p-4 text-slate-500" colSpan={8}>
                    Ładowanie...
                  </td>
                </tr>
              )}
              {!isLoading && appointments.length === 0 && (
                <tr>
                  <td className="p-4 text-slate-500" colSpan={8}>
                    Brak wizyt w wybranym okresie.
                  </td>
                </tr>
              )}
              {appointments.map((a) => (
                <tr key={a.id} className="border-t align-top">
                  <td className="p-3 whitespace-nowrap">
                    {new Date(a.startsAt).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" })}
                  </td>
                  <td className="p-3">{a.patient?.name ?? "—"}</td>
                  <td className="p-3">
                    <div>{a.service?.name ?? "—"}</div>
                    {a.materials?.length ? (
                      <div className="mt-1 text-xs text-slate-500">
                        {a.materials.map((m: any) => `${m.productName} × ${m.quantity}`).join(", ")}
                      </div>
                    ) : null}
                  </td>
                  <td className="p-3">
                    <StatusBadge status={a.status} />
                  </td>
                  <td className="p-3 text-right tabular-nums">{formatPLNFromGrosze(a.revenue)}</td>
                  <td className="p-3 text-right tabular-nums">{formatPLNFromGrosze(a.materialCost)}</td>
                  <td className="p-3 text-right tabular-nums">
                    {a.rate === null ? <span className="text-amber-600">brak</span> : formatPLNFromGrosze(a.rate)}
                  </td>
                  <td className="p-3 text-right tabular-nums font-medium">
                    {a.payout === null ? "—" : formatPLNFromGrosze(a.payout)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <RatesSection specialistId={id} />
    </div>
  );
}

function SidebarPermissionsSection({
  specialistId,
  permissions,
  loading,
  onSaved,
}: {
  specialistId: string;
  permissions?: SidebarPermission[];
  loading: boolean;
  onSaved: () => void;
}) {
  const [selected, setSelected] = React.useState<SidebarPermission[]>([]);
  const [saving, setSaving] = React.useState(false);
  const ready = permissions !== undefined;

  React.useEffect(() => {
    if (permissions) setSelected(permissions);
  }, [permissions]);

  function toggle(permission: SidebarPermission) {
    setSelected((current) =>
      current.includes(permission)
        ? current.filter((item) => item !== permission)
        : SIDEBAR_PERMISSION_OPTIONS.map((item) => item.key).filter(
            (item) => item === permission || current.includes(item),
          ),
    );
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/specialists/${specialistId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sidebarPermissions: selected }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out?.ok) {
        toast.error(out?.message || "Nie udało się zapisać uprawnień");
        return;
      }

      toast.success("Zapisano uprawnienia do panelu");
      onSaved();
    } catch {
      toast.error("Nie udało się zapisać uprawnień");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="border-b p-4">
        <div className="font-medium">Dostęp do lewego panelu</div>
        <div className="mt-1 text-xs text-slate-500">
          Zaznacz sekcje, które ten pracownik może widzieć i otwierać. Administrator zawsze ma dostęp do wszystkich sekcji.
        </div>
      </div>

      <div className="space-y-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SIDEBAR_PERMISSION_OPTIONS.map((item) => {
            const checked = selected.includes(item.key);
            return (
              <button
                key={item.key}
                type="button"
                role="checkbox"
                aria-checked={checked}
                disabled={loading || saving || !ready}
                onClick={() => toggle(item.key)}
                className={
                  "flex items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm font-medium transition " +
                  (checked
                    ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-100"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10")
                }
              >
                <span
                  className={
                    "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-xs " +
                    (checked
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : "border-slate-300 bg-white text-transparent dark:border-white/20 dark:bg-transparent")
                  }
                >
                  ✓
                </span>
                {item.label}
              </button>
            );
          })}
        </div>

        <div className="flex justify-end">
          <Button onClick={save} disabled={loading || saving || !ready}>
            {saving ? "Zapisywanie..." : "Zapisz uprawnienia"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function RatesSection({ specialistId }: { specialistId: string }) {
  const { data, mutate, isLoading } = useSWR(`/api/admin/specialists/${specialistId}/rates`, fetcher);
  const services: Array<{ id: string; name: string; category: string | null; amount: number | null }> =
    data?.services ?? [];
  const baseRate: number | null = data?.specialist?.baseRate ?? null;

  const [filter, setFilter] = React.useState("");
  const [baseInput, setBaseInput] = React.useState<string>("");
  const [savingBase, setSavingBase] = React.useState(false);
  const [edits, setEdits] = React.useState<Record<string, string>>({});
  const [savingId, setSavingId] = React.useState<string | null>(null);

  React.useEffect(() => {
    setBaseInput(baseRate !== null ? (baseRate / 100).toString() : "");
  }, [baseRate]);

  async function put(body: unknown) {
    const res = await fetch(`/api/admin/specialists/${specialistId}/rates`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || !out?.ok) {
      toast.error(out?.message || "Nie udało się zapisać stawki");
      return false;
    }
    return true;
  }

  async function saveBase() {
    const trimmed = baseInput.trim();
    const grosze = trimmed === "" ? null : parsePLNToGrosze(trimmed);
    if (trimmed !== "" && (grosze === null || grosze < 0)) return toast.error("Niepoprawna kwota");
    setSavingBase(true);
    try {
      if (await put({ baseRate: grosze })) {
        toast.success("Zapisano stawkę domyślną");
        mutate();
      }
    } finally {
      setSavingBase(false);
    }
  }

  async function saveService(serviceId: string, rawOverride?: string) {
    const raw = (rawOverride ?? edits[serviceId] ?? "").trim();
    const grosze = raw === "" ? null : parsePLNToGrosze(raw);
    if (raw !== "" && (grosze === null || grosze < 0)) return toast.error("Niepoprawna kwota");
    setSavingId(serviceId);
    try {
      if (await put({ serviceId, amount: grosze })) {
        toast.success(grosze === null ? "Usunięto stawkę — obowiązuje domyślna" : "Zapisano stawkę");
        setEdits((e) => {
          const n = { ...e };
          delete n[serviceId];
          return n;
        });
        mutate();
      }
    } finally {
      setSavingId(null);
    }
  }

  const visible = services.filter((s) => s.name.toLowerCase().includes(filter.toLowerCase()));

  return (
    <Card className="overflow-hidden">
      <div className="border-b p-4">
        <div className="font-medium">Stawki za zabiegi</div>
        <div className="mt-1 text-xs text-slate-500">
          Kwota, jaką pracownik otrzymuje za wykonanie zabiegu (przed odjęciem materiałów). Puste pole przy zabiegu =
          obowiązuje stawka domyślna.
        </div>
      </div>

      <div className="space-y-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <div className="text-sm font-medium">Stawka domyślna (PLN)</div>
            <Input
              className="mt-1 w-40"
              value={baseInput}
              onChange={(e) => setBaseInput(e.target.value)}
              placeholder="np. 200"
            />
          </div>
          <Button onClick={saveBase} disabled={savingBase}>
            {savingBase ? "Zapisywanie..." : "Zapisz domyślną"}
          </Button>
          <div className="ml-auto">
            <Input
              className="w-64"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Szukaj zabiegu..."
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500 dark:bg-white/5">
              <tr>
                <th className="p-3">Zabieg</th>
                <th className="p-3 w-44">Stawka (PLN)</th>
                <th className="p-3 w-56">Działania</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td className="p-4 text-slate-500" colSpan={3}>
                    Ładowanie...
                  </td>
                </tr>
              )}
              {!isLoading && visible.length === 0 && (
                <tr>
                  <td className="p-4 text-slate-500" colSpan={3}>
                    Brak zabiegów.
                  </td>
                </tr>
              )}
              {visible.map((s) => {
                const current = s.amount !== null ? (s.amount / 100).toString() : "";
                const value = edits[s.id] ?? current;
                const dirty = edits[s.id] !== undefined && edits[s.id] !== current;
                return (
                  <tr key={s.id} className="border-t">
                    <td className="p-3">
                      <div>{s.name}</div>
                      {s.amount === null ? (
                        <div className="text-xs text-slate-400">domyślna{baseRate !== null ? `: ${formatPLNFromGrosze(baseRate)}` : " (nie ustawiona)"}</div>
                      ) : null}
                    </td>
                    <td className="p-3">
                      <Input
                        value={value}
                        onChange={(e) => setEdits((m) => ({ ...m, [s.id]: e.target.value }))}
                        placeholder={baseRate !== null ? (baseRate / 100).toString() : "—"}
                      />
                    </td>
                    <td className="p-3">
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => saveService(s.id)} disabled={savingId === s.id || !dirty}>
                          {savingId === s.id ? "..." : "Zapisz"}
                        </Button>
                        {s.amount !== null ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => saveService(s.id, "")}
                            disabled={savingId === s.id}
                          >
                            Usuń stawkę
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  );
}
