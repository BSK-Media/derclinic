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
import { AppointmentCalendar, startOfGrid } from "@/components/appointment-calendar";
import { appointmentStatusLabel } from "@/lib/appointment-status";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function toDateInput(d: Date) {
  return d.toISOString().slice(0, 10);
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
  const [view, setView] = React.useState<"list" | "calendar">(
    requestedView === "calendar" ? "calendar" : "list",
  );
  const [anchor, setAnchor] = React.useState(() => new Date());

  React.useEffect(() => {
    setView(requestedView === "calendar" ? "calendar" : "list");
  }, [requestedView]);

  const changeView = React.useCallback(
    (nextView: "list" | "calendar") => {
      setView(nextView);
      router.replace(`/admin/visits?view=${nextView}`, { scroll: false });
    },
    [router],
  );

  const today = new Date();
  const fromDefault = new Date(today);
  fromDefault.setDate(fromDefault.getDate() - 1);
  const toDefault = new Date(today);
  toDefault.setFullYear(toDefault.getFullYear() + 1);

  const [from, setFrom] = React.useState(toDateInput(fromDefault));
  const [to, setTo] = React.useState(toDateInput(toDefault));
  const [search, setSearch] = React.useState("");
  const [specialistFilter, setSpecialistFilter] = React.useState<string>(ALL_SPECIALISTS);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [defaultDate, setDefaultDate] = React.useState<Date | null>(null);

  // Zakres danych dla widoku kalendarza (siatka 6 tygodni)
  const calendarRange = React.useMemo(() => {
    const start = startOfGrid(anchor);
    const end = new Date(start);
    end.setDate(end.getDate() + 42);
    return { from: start, to: end };
  }, [anchor]);

  const { data, mutate, isLoading } = useSWR(
    view === "calendar"
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
        serviceName.includes(q)
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

        {view === "list" ? (
          <>
            <div className="relative min-w-[220px] flex-1">
              <Input
                placeholder="Wyszukaj rezerwacje"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
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
          </>
        ) : (
          <div className="flex-1" />
        )}
        <Button onClick={() => openAdd()}>Dodaj rezerwację</Button>
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
                  <th className="p-3">Cena</th>
                  <th className="w-10 p-3"></th>
                </tr>
              </thead>
              <tbody>
                {!isLoading && filtered.length === 0 && (
                  <tr>
                    <td className="p-6 text-center text-zinc-500" colSpan={11}>
                      Brak rezerwacji w wybranym zakresie.
                    </td>
                  </tr>
                )}
                {filtered.map((a: any, index: number) => (
                  <tr key={a.id} className="border-t hover:bg-zinc-50 dark:hover:bg-zinc-900/40">
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
                    <td className="p-3 font-medium">{a.patient?.name}</td>
                    <td className="p-3">{a.specialist?.name}</td>
                    <td className="p-3">{a.customServiceName || a.service?.name}</td>
                    <td className="p-3 text-zinc-500">Pojedyncza rezerwacja</td>
                    <td className="p-3">{appointmentStatusLabel(a.status)}</td>
                    <td className="p-3">{formatPLNFromGrosze(a.priceFinal ?? a.priceEstimate)}</td>
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
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
