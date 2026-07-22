"use client";

import * as React from "react";
import useSWR from "swr";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/components/auth-provider";
import { formatPLNFromGrosze } from "@/lib/money";
import { appointmentStatusLabel } from "@/lib/appointment-status";
import { SIDEBAR_PERMISSION_OPTIONS, type SidebarPermission } from "@/lib/sidebar-permissions";
import { SpecialistSchedule } from "@/components/specialist-schedule";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type RangeKey = "today" | "7d" | "30d" | "month" | "custom";

function toDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "COMPLETED"
      ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
      : status === "SCHEDULED"
        ? "bg-sky-100 text-sky-800 hover:bg-sky-100"
        : status === "CANCELED"
          ? "bg-slate-200 text-slate-700 hover:bg-slate-200"
          : "bg-amber-100 text-amber-800 hover:bg-amber-100";
  return <Badge className={cls}>{appointmentStatusLabel(status)}</Badge>;
}

export default function SpecialistDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [tab, setTab] = React.useState<"overview" | "schedule">("overview");
  const [range, setRange] = React.useState<RangeKey>("30d");
  const now = React.useMemo(() => new Date(), []);
  const [from, setFrom] = React.useState(() =>
    toDateInput(new Date(now.getFullYear(), now.getMonth(), 1)),
  );
  const [to, setTo] = React.useState(() => toDateInput(now));
  const customRangeInvalid = range === "custom" && (!from || !to || from > to);
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  const overviewQuery = React.useMemo(() => {
    const params = new URLSearchParams({ range });
    if (range === "custom") {
      params.set("from", from);
      params.set("to", to);
    }
    return params.toString();
  }, [range, from, to]);

  const { data, isLoading, mutate } = useSWR(
    customRangeInvalid ? null : `/api/admin/specialists/${id}/overview?${overviewQuery}`,
    fetcher,
  );
  const [decidingId, setDecidingId] = React.useState<string | null>(null);

  async function decide(appointmentId: string, action: "APPROVE" | "REJECT") {
    setDecidingId(appointmentId);
    try {
      const res = await fetch(`/api/admin/appointments/${appointmentId}/approve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out?.ok) return toast.error(out?.message || "Nie udało się zapisać decyzji");
      toast.success(action === "APPROVE" ? "Wizyta zaakceptowana" : "Wizyta odrzucona");
      mutate();
    } finally {
      setDecidingId(null);
    }
  }
  const specialist = data?.specialist;
  const stats = data?.stats;
  const appointments: any[] = data?.appointments ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 overflow-hidden rounded-2xl bg-slate-200 ring-1 ring-black/5 dark:bg-white/10">
            {specialist?.avatarUrl ? (
              <img
                src={specialist.avatarUrl}
                alt={specialist.name}
                className="h-full w-full object-cover"
              />
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

        <Link
          href={user?.role === "RECEPTION" ? "/admin/visits" : "/admin/specialists"}
          className="text-sm text-emerald-700 underline underline-offset-2 dark:text-emerald-300"
        >
          ← {user?.role === "RECEPTION" ? "Wróć do wizyt" : "Wróć do listy"}
        </Link>
      </div>

      {/* Zakładki: Przegląd / Grafik */}
      <div className="inline-flex rounded-2xl border border-white/60 bg-white/70 p-1 text-sm shadow-sm dark:border-white/10 dark:bg-[#0b1220]/55">
        <button
          type="button"
          onClick={() => setTab("overview")}
          className={
            "rounded-2xl px-4 py-1.5 font-medium " +
            (tab === "overview"
              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200"
              : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white")
          }
        >
          Przegląd
        </button>
        <button
          type="button"
          onClick={() => setTab("schedule")}
          className={
            "rounded-2xl px-4 py-1.5 font-medium " +
            (tab === "schedule"
              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200"
              : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white")
          }
        >
          Grafik
        </button>
      </div>

      {tab === "schedule" ? (
        <SpecialistSchedule specialistId={id} />
      ) : (
        <>
          {user?.role === "ADMIN" ? (
            <SidebarPermissionsSection
              specialistId={id}
              permissions={specialist?.sidebarPermissions}
              loading={isLoading}
              onSaved={() => mutate()}
            />
          ) : null}

          {/* Filtr zakresu — te same opcje co na liście rozliczeń specjalistów */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="inline-flex flex-wrap rounded-2xl border border-white/60 bg-white/70 p-1 text-sm shadow-sm dark:border-white/10 dark:bg-[#0b1220]/55">
              {(
                [
                  { k: "today", label: "Dziś" },
                  { k: "7d", label: "7 dni" },
                  { k: "30d", label: "30 dni" },
                  { k: "month", label: "Ten miesiąc" },
                  { k: "custom", label: "Niestandardowe" },
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

            {range === "custom" ? (
              <>
                <div>
                  <div className="text-xs text-slate-500">Od</div>
                  <Input
                    type="date"
                    value={from}
                    onChange={(event) => setFrom(event.target.value)}
                    className="mt-1 w-44"
                  />
                </div>
                <div>
                  <div className="text-xs text-slate-500">Do</div>
                  <Input
                    type="date"
                    value={to}
                    onChange={(event) => setTo(event.target.value)}
                    className="mt-1 w-44"
                  />
                </div>
              </>
            ) : null}
          </div>

          {customRangeInvalid ? (
            <div className="text-sm text-red-600">Wybierz poprawny zakres dat.</div>
          ) : null}

          {/* Statystyki (z wizyt zakończonych) */}
          <div
            className={
              "grid gap-4 md:grid-cols-2 " + (isAdmin ? "xl:grid-cols-5" : "xl:grid-cols-2")
            }
          >
            <Card className="p-4">
              <div className="text-sm text-slate-500">Wizyty zakończone</div>
              <div className="mt-2 text-3xl font-semibold">
                {stats?.appointmentsCompleted ?? "—"}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                wszystkie w okresie: {stats?.appointmentsTotal ?? "—"}
              </div>
            </Card>
            {isAdmin ? (
              <>
                <Card className="p-4">
                  <div className="text-sm text-slate-500">Przychód dla kliniki</div>
                  <div className="mt-2 text-3xl font-semibold">
                    {stats ? formatPLNFromGrosze(stats.revenue) : "—"}
                  </div>
                </Card>
                <Card className="p-4">
                  <div className="text-sm text-slate-500">Koszt materiałów</div>
                  <div className="mt-2 text-3xl font-semibold">
                    {stats ? formatPLNFromGrosze(stats.materialCost) : "—"}
                  </div>
                </Card>
                <Card className="p-4">
                  <div className="text-sm text-slate-500">Wynagrodzenie pracownika</div>
                  <div className="mt-2 text-3xl font-semibold">
                    {stats ? formatPLNFromGrosze(stats.payout) : "—"}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {stats
                      ? `${stats.percent}% × (przychód − materiały)`
                      : "% × (przychód − materiały)"}
                  </div>
                </Card>
                <Card className="p-4">
                  <div className="text-sm text-slate-500">Zysk kliniki</div>
                  <div className="mt-2 text-3xl font-semibold">
                    {stats ? formatPLNFromGrosze(stats.profit) : "—"}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    przychód − materiały − wynagrodzenie
                  </div>
                </Card>
              </>
            ) : null}
          </div>

          {user?.role === "ADMIN" ? (
            <>
              <WarehousesSection
                specialistId={id}
                assignedLocationId={specialist?.assignedLocation?.id}
              />
              <LocationsSection
                specialistId={id}
                assignedLocationId={specialist?.assignedLocation?.id}
                onSaved={() => mutate()}
              />
              <PayoutPercentSection
                specialistId={id}
                percent={stats?.percent}
                onSaved={() => mutate()}
              />
            </>
          ) : null}

          {/* Historia wizyt */}
          <Card className="overflow-hidden">
            <div className="border-b p-4">
              <div className="font-medium">Historia wizyt</div>
              <div className="mt-1 text-xs text-slate-500">
                {isAdmin
                  ? "Kwoty: przychód (cena wizyty), materiały (koszt zakupu zużytych produktów), wypłata = (przychód − materiały) × procent pracownika. Do statystyk i wypłaty liczą się tylko wizyty zakończone i zaakceptowane."
                  : "Do statystyk liczą się tylko wizyty zakończone i zaakceptowane."}
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
                    {isAdmin ? (
                      <>
                        <th className="p-3 text-right">Przychód</th>
                        <th className="p-3 text-right">Materiały</th>
                        <th className="p-3 text-right">Baza (przychód − materiały)</th>
                        <th className="p-3 text-right">Wypłata</th>
                      </>
                    ) : null}
                    <th className="w-32 p-3 text-right">Akcje</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading && (
                    <tr>
                      <td className="p-4 text-slate-500" colSpan={isAdmin ? 9 : 5}>
                        Ładowanie...
                      </td>
                    </tr>
                  )}
                  {!isLoading && appointments.length === 0 && (
                    <tr>
                      <td className="p-4 text-slate-500" colSpan={isAdmin ? 9 : 5}>
                        Brak wizyt w wybranym okresie.
                      </td>
                    </tr>
                  )}
                  {appointments.map((a) => (
                    <tr key={a.id} className="border-t align-top">
                      <td className="whitespace-nowrap p-3">
                        {new Date(a.startsAt).toLocaleString("pl-PL", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </td>
                      <td className="p-3">{a.patient?.name ?? "—"}</td>
                      <td className="p-3">
                        <div>{a.customServiceName || a.service?.name || "—"}</div>
                        {a.materials?.length ? (
                          <div className="mt-1 text-xs text-slate-500">
                            {a.materials
                              .map((m: any) => `${m.productName} × ${m.quantity}`)
                              .join(", ")}
                          </div>
                        ) : null}
                      </td>
                      <td className="p-3">
                        <StatusBadge status={a.status} />
                        {a.status === "COMPLETED" && a.approvalStatus === "PENDING" ? (
                          <div className="mt-1 text-xs text-amber-600">do akceptacji</div>
                        ) : null}
                        {a.status === "COMPLETED" && a.approvalStatus === "REJECTED" ? (
                          <div className="mt-1 text-xs text-red-600">odrzucona</div>
                        ) : null}
                      </td>
                      {isAdmin ? (
                        <>
                          <td className="p-3 text-right tabular-nums">
                            {formatPLNFromGrosze(a.revenue)}
                          </td>
                          <td className="p-3 text-right tabular-nums">
                            {formatPLNFromGrosze(a.materialCost)}
                          </td>
                          <td className="p-3 text-right tabular-nums">
                            {formatPLNFromGrosze(a.base)}
                          </td>
                          <td className="p-3 text-right font-medium tabular-nums">
                            {formatPLNFromGrosze(a.payout)}
                          </td>
                        </>
                      ) : null}
                      <td className="p-3">
                        <div className="flex items-center justify-end gap-1">
                          {a.status === "COMPLETED" && a.approvalStatus === "PENDING" ? (
                            <>
                              <button
                                type="button"
                                title="Zaakceptuj wizytę"
                                onClick={() => decide(a.id, "APPROVE")}
                                disabled={decidingId === a.id}
                                className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20"
                              >
                                ✓
                              </button>
                              <button
                                type="button"
                                title="Odrzuć wizytę"
                                onClick={() => decide(a.id, "REJECT")}
                                disabled={decidingId === a.id}
                                className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20"
                              >
                                ✕
                              </button>
                            </>
                          ) : null}
                          <Link
                            href={`/admin/appointments/${a.id}`}
                            title="Szczegóły wizyty"
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
                          >
                            👁
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function WarehousesSection({
  specialistId,
  assignedLocationId,
}: {
  specialistId: string;
  assignedLocationId?: string;
}) {
  const { data, mutate, isLoading } = useSWR(
    assignedLocationId
      ? `/api/admin/specialists/${specialistId}/warehouses?locationId=${encodeURIComponent(assignedLocationId)}`
      : null,
    fetcher,
  );
  const warehouses: Array<{ id: string; name: string }> = data?.warehouses ?? [];
  const assignedIds: string[] = data?.assignedIds ?? [];
  const [savingId, setSavingId] = React.useState<string | null>(null);

  async function toggle(warehouseId: string, assigned: boolean) {
    setSavingId(warehouseId);
    try {
      const res = await fetch(`/api/admin/specialists/${specialistId}/warehouses`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ warehouseId, assigned }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out?.ok) return toast.error(out?.message || "Nie udało się zapisać");
      toast.success(assigned ? "Przypisano magazyn" : "Odpisano magazyn");
      mutate();
    } finally {
      setSavingId(null);
    }
  }

  return (
    <Card className="space-y-3 p-4">
      <div>
        <div className="font-medium">Przypisane magazyny</div>
        <div className="mt-1 text-xs text-slate-500">
          Pracownik może rejestrować zużycie preparatów wyłącznie z przypisanych tu magazynów.
          Kliknij, aby przypisać/odpisać.
        </div>
      </div>
      {isLoading ? <div className="text-sm text-slate-500">Ładowanie...</div> : null}
      <div className="flex flex-wrap gap-2">
        {warehouses.map((w) => {
          const assigned = assignedIds.includes(w.id);
          return (
            <button
              key={w.id}
              type="button"
              disabled={savingId === w.id}
              onClick={() => toggle(w.id, !assigned)}
              className={
                "rounded-full border px-3 py-1.5 text-sm transition disabled:opacity-60 " +
                (assigned
                  ? "border-emerald-300 bg-emerald-100 font-medium text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-200"
                  : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10")
              }
            >
              {assigned ? "✓ " : ""}
              {w.name}
            </button>
          );
        })}
      </div>
      {!isLoading && assignedIds.length === 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          Brak przypisanych magazynów — pracownik nie będzie mógł rejestrować zużycia preparatów.
        </div>
      ) : null}
    </Card>
  );
}

function LocationsSection({
  specialistId,
  assignedLocationId,
  onSaved,
}: {
  specialistId: string;
  assignedLocationId?: string;
  onSaved: () => void;
}) {
  const { data, isLoading } = useSWR("/api/admin/locations", fetcher);
  const locations: Array<{ id: string; name: string }> = data?.locations ?? [];
  const [savingId, setSavingId] = React.useState<string | null>(null);

  async function assign(locationId: string) {
    if (!assignedLocationId || locationId === assignedLocationId) return;

    setSavingId(locationId);
    try {
      const res = await fetch(`/api/admin/users/${specialistId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ locationId }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out?.ok) {
        return toast.error(out?.message || "Nie udało się przypisać lokalizacji");
      }

      toast.success("Przypisano lokalizację");
      onSaved();
    } finally {
      setSavingId(null);
    }
  }

  return (
    <Card className="space-y-3 p-4">
      <div>
        <div className="font-medium">Przypisana lokalizacja</div>
        <div className="mt-1 text-xs text-slate-500">
          Pracownik widzi dane placówki przypisanej w tej sekcji. Kliknij inną lokalizację, aby
          przenieść do niej pracownika.
        </div>
      </div>
      {isLoading || !assignedLocationId ? (
        <div className="text-sm text-slate-500">Ładowanie...</div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {locations.map((location) => {
          const assigned = location.id === assignedLocationId;
          return (
            <button
              key={location.id}
              type="button"
              disabled={savingId !== null || !assignedLocationId}
              onClick={() => assign(location.id)}
              className={
                "rounded-full border px-3 py-1.5 text-sm transition disabled:opacity-60 " +
                (assigned
                  ? "border-emerald-300 bg-emerald-100 font-medium text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-200"
                  : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10")
              }
            >
              {assigned ? "✓ " : ""}
              {location.name}
            </button>
          );
        })}
      </div>
      {!isLoading && locations.length === 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          Brak aktywnych lokalizacji do przypisania.
        </div>
      ) : null}
    </Card>
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
  const [mobileExpanded, setMobileExpanded] = React.useState(false);
  const ready = permissions !== undefined;

  React.useEffect(() => {
    if (permissions) setSelected(permissions);
  }, [permissions]);

  React.useEffect(() => {
    setMobileExpanded(false);
  }, [specialistId]);

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
      <button
        type="button"
        aria-expanded={mobileExpanded}
        aria-controls="sidebar-permissions-content"
        onClick={() => setMobileExpanded((current) => !current)}
        className="flex w-full items-center justify-between gap-4 p-4 text-left md:hidden"
      >
        <span className="font-medium">Dostęp do lewego panelu</span>
        <ChevronDown
          aria-hidden="true"
          className={
            "h-5 w-5 shrink-0 text-slate-500 transition-transform duration-200 " +
            (mobileExpanded ? "rotate-180" : "")
          }
        />
      </button>

      <div className="hidden border-b p-4 md:block">
        <div className="font-medium">Dostęp do lewego panelu</div>
        <div className="mt-1 text-xs text-slate-500">
          Zaznacz sekcje, które ten pracownik może widzieć i otwierać. Administrator zawsze ma
          dostęp do wszystkich sekcji.
        </div>
      </div>

      <div
        id="sidebar-permissions-content"
        className={
          (mobileExpanded ? "block" : "hidden") + " space-y-4 border-t p-4 md:block md:border-t-0"
        }
      >
        <div className="text-xs text-slate-500 md:hidden">
          Zaznacz sekcje, które ten pracownik może widzieć i otwierać. Administrator zawsze ma
          dostęp do wszystkich sekcji.
        </div>
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

function PayoutPercentSection({
  specialistId,
  percent,
  onSaved,
}: {
  specialistId: string;
  percent: number | undefined;
  onSaved: () => void;
}) {
  const [value, setValue] = React.useState<string>("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (percent !== undefined) setValue(String(percent));
  }, [percent]);

  async function save() {
    const n = Number(value.replace(",", "."));
    if (!Number.isInteger(n) || n < 0 || n > 100) {
      return toast.error("Podaj procent jako liczbę całkowitą od 0 do 100.");
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${specialistId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ payoutPercent: n }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out?.ok) return toast.error(out?.message || "Nie udało się zapisać procentu");
      toast.success("Zapisano procent pracownika");
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="space-y-3 p-4">
      <div>
        <div className="font-medium">Procent od zabiegów</div>
        <div className="mt-1 text-xs text-slate-500">
          Rozliczenie: (przychód z zabiegu − koszt zużytych materiałów) × procent pracownika. Ten
          sam procent obowiązuje dla wszystkich zabiegów tego pracownika.
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <div className="text-sm font-medium">Procent (%)</div>
          <Input
            className="mt-1 w-32"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="np. 40"
          />
        </div>
        <Button onClick={save} disabled={saving || percent === undefined}>
          {saving ? "Zapisywanie..." : "Zapisz procent"}
        </Button>
        {percent !== undefined ? (
          <div className="text-sm text-slate-500">
            Aktualnie:{" "}
            <span className="font-medium text-slate-800 dark:text-slate-200">{percent}%</span>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
