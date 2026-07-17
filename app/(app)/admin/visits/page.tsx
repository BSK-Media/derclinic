"use client";

import useSWR from "swr";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatPLNFromGrosze } from "@/lib/money";
import { AdminBookAppointmentDialog } from "@/components/admin-book-appointment-dialog";
import {
  ApprovalBadge,
  DeleteAppointmentDialog,
  RejectReasonDialog,
} from "@/components/appointment-approval";
import { toast } from "sonner";
import { AppointmentCalendar, startOfGrid } from "@/components/appointment-calendar";
import { appointmentStatusLabel } from "@/lib/appointment-status";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function toDateInput(d: Date) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const ALL_SPECIALISTS = "__ALL__";

type AdminVisitsPageProps = {
  searchParams?: {
    view?: string | string[];
  };
};

export default function AdminVisitsPage({ searchParams }: AdminVisitsPageProps) {
  const router = useRouter();
  const requestedView = Array.isArray(searchParams?.view)
    ? searchParams?.view[0]
    : searchParams?.view;
  const normalizedRequestedView =
    requestedView === "calendar" || requestedView === "deleted" ? requestedView : "list";
  const [view, setView] = React.useState<"list" | "calendar" | "deleted">(normalizedRequestedView);
  const [anchor, setAnchor] = React.useState(() => new Date());

  React.useEffect(() => {
    setView(requestedView === "calendar" || requestedView === "deleted" ? requestedView : "list");
  }, [requestedView]);

  const changeView = React.useCallback(
    (nextView: "list" | "calendar" | "deleted") => {
      setView(nextView);
      router.replace(`/admin/visits?view=${nextView}`, { scroll: false });
    },
    [router],
  );

  const today = React.useMemo(() => new Date(), []);
  const fromDefault = React.useMemo(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
    [today],
  );
  const toDefault = React.useMemo(
    () => new Date(today.getFullYear(), today.getMonth() + 1, 0),
    [today],
  );

  const [from, setFrom] = React.useState(toDateInput(fromDefault));
  const [to, setTo] = React.useState(toDateInput(toDefault));
  const [search, setSearch] = React.useState("");
  const [specialistFilter, setSpecialistFilter] = React.useState<string>(ALL_SPECIALISTS);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [defaultDate, setDefaultDate] = React.useState<Date | null>(null);
  const [decidingId, setDecidingId] = React.useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = React.useState<any | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<any | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  // Zakres danych dla widoku kalendarza (siatka 6 tygodni)
  const calendarRange = React.useMemo(() => {
    const start = startOfGrid(anchor);
    const end = new Date(start);
    end.setDate(end.getDate() + 42);
    return { from: start, to: end };
  }, [anchor]);

  const { data, mutate, isLoading } = useSWR(
    view === "deleted"
      ? "/api/admin/appointments?deleted=only"
      : view === "calendar"
        ? `/api/admin/appointments?from=${calendarRange.from.toISOString()}&to=${calendarRange.to.toISOString()}`
        : `/api/admin/appointments?from=${from}&to=${to}`,
    fetcher,
  );

  const appointments = data?.appointments ?? [];
  const patients = data?.patients ?? [];
  const specialists = data?.specialists ?? [];
  const services = data?.services ?? [];

  // Filtr po specjaliście — wspólny dla listy i kalendarza
  const bySpecialist = React.useMemo(() => {
    if (specialistFilter === ALL_SPECIALISTS) return appointments;
    return appointments.filter((a: any) => a.specialist?.id === specialistFilter);
  }, [appointments, specialistFilter]);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return bySpecialist;
    return bySpecialist.filter((a: any) => {
      const serviceName = (a.customServiceName || a.service?.name || "").toLowerCase();
      return (
        a.patient?.name?.toLowerCase().includes(q) ||
        a.specialist?.name?.toLowerCase().includes(q) ||
        serviceName.includes(q) ||
        a.deletionReason?.toLowerCase().includes(q) ||
        a.deletedBy?.name?.toLowerCase().includes(q)
      );
    });
  }, [bySpecialist, search]);

  function toggleAll() {
    if (selected.size === filtered.length) return setSelected(new Set());
    setSelected(new Set(filtered.map((a: any) => a.id)));
  }
  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function decide(id: string, action: "APPROVE" | "REJECT", reason?: string) {
    setDecidingId(id);
    try {
      const res = await fetch(`/api/admin/appointments/${id}/approve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, reason }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out?.ok) {
        toast.error(out?.message || "Nie udało się zapisać decyzji");
        return false;
      }
      toast.success(action === "APPROVE" ? "Wizyta zaakceptowana" : "Wizyta odrzucona");
      mutate();
      return true;
    } finally {
      setDecidingId(null);
    }
  }

  async function confirmReject(reason: string) {
    if (!rejectTarget) return;
    const ok = await decide(rejectTarget.id, "REJECT", reason);
    if (ok) setRejectTarget(null);
  }

  async function confirmDelete(reason: string) {
    if (!deleteTarget) return;
    setDeletingId(deleteTarget.id);
    try {
      const res = await fetch(`/api/admin/appointments/${deleteTarget.id}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out?.ok) {
        toast.error(out?.message || "Nie udało się usunąć wizyty");
        return;
      }
      setDeleteTarget(null);
      toast.success("Wizyta została przeniesiona do usuniętych");
      mutate();
    } finally {
      setDeletingId(null);
    }
  }

  async function cancelAppointment(id: string) {
    const res = await fetch(`/api/admin/appointments/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "CANCELED" }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || !out?.ok) return;
    mutate();
  }

  function openAdd(date?: Date) {
    setDefaultDate(date ?? null);
    setDialogOpen(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Wizyty</h1>
        <div className="inline-flex rounded-xl border bg-white p-1 text-sm shadow-sm dark:bg-zinc-950">
          <button
            type="button"
            onClick={() => changeView("list")}
            className={
              "rounded-lg px-4 py-1.5 font-medium transition " +
              (view === "list"
                ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white")
            }
          >
            Lista
          </button>
          <button
            type="button"
            onClick={() => changeView("calendar")}
            className={
              "rounded-lg px-4 py-1.5 font-medium transition " +
              (view === "calendar"
                ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white")
            }
          >
            Kalendarz
          </button>
          <button
            type="button"
            onClick={() => changeView("deleted")}
            className={
              "rounded-lg px-4 py-1.5 font-medium transition " +
              (view === "deleted"
                ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white")
            }
          >
            Usunięte wizyty
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="w-56">
          <Select value={specialistFilter} onValueChange={setSpecialistFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Specjalista" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_SPECIALISTS}>Wszyscy specjaliści</SelectItem>
              {specialists.map((s: any) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {view !== "calendar" ? (
          <>
            <div className="relative min-w-[220px] flex-1">
              <Input
                placeholder="Wyszukaj rezerwacje"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {view === "list" ? (
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="w-40"
                />
                <span className="text-zinc-400">–</span>
                <Input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="w-40"
                />
              </div>
            ) : null}
          </>
        ) : (
          <div className="flex-1" />
        )}
        {view !== "deleted" ? <Button onClick={() => openAdd()}>Dodaj rezerwację</Button> : null}
      </div>

      {view === "calendar" ? (
        <AppointmentCalendar
          anchor={anchor}
          onAnchorChange={setAnchor}
          appointments={bySpecialist}
          isLoading={isLoading}
          onAdd={openAdd}
          showAddButton={false}
          onOpenAppointment={(id) => router.push(`/admin/appointments/${id}`)}
          showSpecialist={specialistFilter === ALL_SPECIALISTS}
        />
      ) : view === "deleted" ? (
        <div className="overflow-hidden rounded-2xl border bg-white shadow-sm dark:bg-zinc-950">
          <div className="border-b px-4 py-3 text-sm text-zinc-500">
            W tym miejscu przechowywane są wizyty usunięte przez administratora lub recepcję. Dane
            wizyty pozostają zachowane w systemie.
          </div>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-xs uppercase text-zinc-500">
                <tr>
                  <th className="p-3">Data wizyty</th>
                  <th className="p-3">Czas</th>
                  <th className="p-3">Klient</th>
                  <th className="p-3">Specjalista</th>
                  <th className="p-3">Usługa</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Data usunięcia</th>
                  <th className="p-3">Usunięta przez</th>
                  <th className="min-w-64 p-3">Powód usunięcia</th>
                </tr>
              </thead>
              <tbody>
                {!isLoading && filtered.length === 0 ? (
                  <tr>
                    <td className="p-6 text-center text-zinc-500" colSpan={9}>
                      Brak usuniętych wizyt.
                    </td>
                  </tr>
                ) : null}
                {filtered.map((a: any) => (
                  <tr key={a.id} className="border-t bg-zinc-50/70 dark:bg-white/[0.03]">
                    <td className="p-3">{new Date(a.startsAt).toLocaleDateString("pl-PL")}</td>
                    <td className="p-3">
                      {new Date(a.startsAt).toLocaleTimeString("pl-PL", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="p-3 font-medium">{a.patient?.name ?? "—"}</td>
                    <td className="p-3">{a.specialist?.name ?? "—"}</td>
                    <td className="p-3">{a.customServiceName || a.service?.name || "—"}</td>
                    <td className="p-3">{appointmentStatusLabel(a.status)}</td>
                    <td className="p-3">
                      {a.deletedAt ? new Date(a.deletedAt).toLocaleString("pl-PL") : "—"}
                    </td>
                    <td className="p-3">{a.deletedBy?.name || a.deletedBy?.login || "—"}</td>
                    <td className="whitespace-pre-wrap p-3 text-zinc-700 dark:text-zinc-200">
                      {a.deletionReason || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-white shadow-sm dark:bg-zinc-950">
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-xs uppercase text-zinc-500">
                <tr>
                  <th className="w-10 p-3">
                    <input
                      type="checkbox"
                      checked={filtered.length > 0 && selected.size === filtered.length}
                      onChange={toggleAll}
                    />
                  </th>
                  <th className="p-3">ID</th>
                  <th className="p-3">Data</th>
                  <th className="p-3">Czas</th>
                  <th className="p-3">Klient</th>
                  <th className="p-3">Specjalista</th>
                  <th className="p-3">Usługa</th>
                  <th className="p-3">Typ</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Akceptacja</th>
                  <th className="p-3">Cena</th>
                  <th className="w-10 p-3"></th>
                </tr>
              </thead>
              <tbody>
                {!isLoading && filtered.length === 0 && (
                  <tr>
                    <td className="p-6 text-center text-zinc-500" colSpan={12}>
                      Brak rezerwacji w wybranym zakresie.
                    </td>
                  </tr>
                )}
                {filtered.map((a: any, index: number) => {
                  const isHistorical = toDateInput(new Date(a.startsAt)) < toDateInput(today);
                  return (
                    <tr
                      key={a.id}
                      className={
                        "border-t " +
                        (isHistorical
                          ? "bg-zinc-50 hover:bg-zinc-100 dark:bg-white/[0.03] dark:hover:bg-white/[0.06]"
                          : "hover:bg-zinc-50 dark:hover:bg-zinc-900/40")
                      }
                    >
                      <td className="p-3">
                        <input
                          type="checkbox"
                          checked={selected.has(a.id)}
                          onChange={() => toggleOne(a.id)}
                        />
                      </td>
                      <td className="p-3 text-zinc-500">{filtered.length - index}</td>
                      <td className="p-3">{new Date(a.startsAt).toLocaleDateString("pl-PL")}</td>
                      <td className="p-3">
                        {new Date(a.startsAt).toLocaleTimeString("pl-PL", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="p-3 font-medium">
                        {a.patient?.id ? (
                          <Link
                            href={`/admin/patients/${a.patient.id}`}
                            className="underline-offset-2 hover:text-emerald-700 hover:underline dark:hover:text-emerald-300"
                          >
                            {a.patient.name}
                          </Link>
                        ) : (
                          a.patient?.name
                        )}
                      </td>
                      <td className="p-3">
                        {a.specialist?.id ? (
                          <Link
                            href={`/admin/specialists/${a.specialist.id}`}
                            className="underline-offset-2 hover:text-emerald-700 hover:underline dark:hover:text-emerald-300"
                          >
                            {a.specialist.name}
                          </Link>
                        ) : (
                          a.specialist?.name
                        )}
                      </td>
                      <td className="p-3">
                        {!a.customServiceName && a.service?.id ? (
                          <Link
                            href={`/admin/services?serviceId=${encodeURIComponent(a.service.id)}`}
                            className="underline-offset-2 hover:text-emerald-700 hover:underline dark:hover:text-emerald-300"
                          >
                            {a.service.name}
                          </Link>
                        ) : (
                          a.customServiceName || a.service?.name
                        )}
                      </td>
                      <td className="p-3 text-zinc-500">Pojedyncza rezerwacja</td>
                      <td className="p-3">{appointmentStatusLabel(a.status)}</td>
                      <td className="p-3">
                        {a.status === "COMPLETED" ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <ApprovalBadge status={a.approvalStatus} reason={a.rejectionReason} />
                            {a.approvalStatus === "PENDING" ? (
                              <div className="flex items-center gap-1">
                                <Button
                                  size="sm"
                                  onClick={() => decide(a.id, "APPROVE")}
                                  disabled={decidingId === a.id}
                                >
                                  {decidingId === a.id ? "…" : "✓ Zaakceptuj"}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="border-red-300 text-red-600 hover:bg-red-50 dark:border-red-500/40 dark:hover:bg-red-500/10"
                                  onClick={() => setRejectTarget(a)}
                                  disabled={decidingId === a.id}
                                >
                                  ✕ Odrzuć
                                </Button>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                        {a.status === "COMPLETED" &&
                        a.approvalStatus === "REJECTED" &&
                        a.rejectionReason ? (
                          <div className="mt-1 max-w-56 text-xs text-zinc-500">
                            Powód: {a.rejectionReason}
                          </div>
                        ) : null}
                      </td>
                      <td className="p-3">
                        {formatPLNFromGrosze(a.priceFinal ?? a.priceEstimate)}
                      </td>
                      <td className="p-3 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="rounded-lg px-2 py-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                              •••
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link href={`/admin/appointments/${a.id}`}>Szczegóły</Link>
                            </DropdownMenuItem>
                            {a.status === "SCHEDULED" && (
                              <DropdownMenuItem onSelect={() => cancelAppointment(a.id)}>
                                Anuluj wizytę
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              className="text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-300"
                              onSelect={() => setDeleteTarget(a)}
                            >
                              Usuń wizytę
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <RejectReasonDialog
        open={rejectTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRejectTarget(null);
        }}
        onConfirm={confirmReject}
        saving={decidingId !== null}
        contextLabel={
          rejectTarget
            ? `${new Date(rejectTarget.startsAt).toLocaleString("pl-PL", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })} • ${rejectTarget.patient?.name ?? ""} • ${
                rejectTarget.customServiceName || rejectTarget.service?.name || ""
              }`
            : null
        }
      />

      <DeleteAppointmentDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deletingId) setDeleteTarget(null);
        }}
        onConfirm={confirmDelete}
        saving={deletingId !== null}
        contextLabel={
          deleteTarget
            ? `${new Date(deleteTarget.startsAt).toLocaleString("pl-PL", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })} • ${deleteTarget.patient?.name ?? ""} • ${
                deleteTarget.customServiceName || deleteTarget.service?.name || ""
              }`
            : null
        }
      />

      <AdminBookAppointmentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        patients={patients}
        specialists={specialists}
        services={services}
        defaultDate={defaultDate}
        onCreated={() => mutate()}
      />
    </div>
  );
}
