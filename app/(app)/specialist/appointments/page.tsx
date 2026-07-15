"use client";

import * as React from "react";
import Link from "next/link";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SpecialistBookAppointmentDialog } from "@/components/specialist-book-appointment-dialog";
import { AppointmentCalendar, startOfGrid } from "@/components/appointment-calendar";
import { useRouter } from "next/navigation";

const fetcher = (url: string) => fetch(url).then((response) => response.json());

function toDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: "Zaplanowana",
  COMPLETED: "Zakończona",
  CANCELED: "Anulowana",
  NO_SHOW: "Nieobecność",
};

export default function SpecialistAppointmentsPage() {
  const router = useRouter();
  const [view, setView] = React.useState<"list" | "calendar">("list");
  const [anchor, setAnchor] = React.useState(() => new Date());

  // Zakres danych dla widoku kalendarza (siatka 6 tygodni)
  const calendarRange = React.useMemo(() => {
    const from = startOfGrid(anchor);
    const to = new Date(from);
    to.setDate(to.getDate() + 42);
    return { from, to };
  }, [anchor]);

  const today = React.useMemo(() => new Date(), []);
  const fromDefault = React.useMemo(() => {
    const date = new Date(today);
    date.setDate(date.getDate() - 7);
    return toDateInput(date);
  }, [today]);
  const toDefault = React.useMemo(() => {
    const date = new Date(today);
    date.setFullYear(date.getFullYear() + 1);
    return toDateInput(date);
  }, [today]);

  const [from, setFrom] = React.useState(fromDefault);
  const [to, setTo] = React.useState(toDefault);
  const [search, setSearch] = React.useState("");
  const { data, mutate, isLoading } = useSWR(
    view === "calendar"
      ? `/api/specialist/appointments?from=${calendarRange.from.toISOString()}&to=${calendarRange.to.toISOString()}`
      : `/api/specialist/appointments?from=${from}&to=${to}`,
    fetcher,
  );

  const appointments = data?.appointments ?? [];
  const services = data?.services ?? [];
  const products = data?.products ?? [];

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return appointments;
    return appointments.filter((a: any) => {
      const serviceName = (a.customServiceName || a.service?.name || "").toLowerCase();
      return a.patient?.name?.toLowerCase().includes(q) || serviceName.includes(q);
    });
  }, [appointments, search]);

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [dialogDate, setDialogDate] = React.useState<Date>(new Date());

  function openAdd(date?: Date) {
    setDialogDate(date ?? new Date());
    setDialogOpen(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Wizyty</h1>
        <div className="flex items-center gap-3">
          <div className="inline-flex rounded-xl border bg-white p-1 text-sm shadow-sm dark:bg-zinc-950">
            <button
              type="button"
              onClick={() => setView("list")}
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
              onClick={() => setView("calendar")}
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
          <Button onClick={() => openAdd()}>+ Nowa wizyta</Button>
        </div>
      </div>

      <SpecialistBookAppointmentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        services={services}
        products={products}
        defaultDate={dialogDate}
        onCreated={() => mutate()}
      />

      {view === "calendar" ? (
        <AppointmentCalendar
          anchor={anchor}
          onAnchorChange={setAnchor}
          appointments={appointments}
          isLoading={isLoading}
          onAdd={openAdd}
          onOpenAppointment={(id: string) => router.push(`/specialist/appointments/${id}`)}
        />
      ) : (
      <>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-[220px] flex-1">
          <Input placeholder="Wyszukaj rezerwacje" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="w-40" />
          <span className="text-zinc-400">–</span>
          <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="w-40" />
        </div>
        <div className="text-sm text-zinc-500">{isLoading ? "Ładowanie…" : `Wyniki: ${filtered.length}`}</div>
      </div>

      <div className="rounded-2xl border bg-white shadow-sm dark:bg-zinc-950">
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="border-b text-left text-xs uppercase text-zinc-500">
              <tr>
                <th className="p-3">Data</th>
                <th className="p-3">Czas</th>
                <th className="p-3">Pacjent</th>
                <th className="p-3">Usługa</th>
                <th className="p-3">Typ</th>
                <th className="p-3">Status</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {!isLoading && filtered.length === 0 ? (
                <tr><td className="p-6 text-center text-zinc-500" colSpan={7}>Brak wizyt.</td></tr>
              ) : null}
              {filtered.map((appointment: any) => (
                <tr key={appointment.id} className="border-t hover:bg-zinc-50 dark:hover:bg-zinc-900/40">
                  <td className="p-3">{new Date(appointment.startsAt).toLocaleDateString("pl-PL")}</td>
                  <td className="p-3">
                    {new Date(appointment.startsAt).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td className="p-3 font-medium">{appointment.patient.name}</td>
                  <td className="p-3">{appointment.customServiceName || appointment.service.name}</td>
                  <td className="p-3 text-zinc-500">Pojedyncza rezerwacja</td>
                  <td className="p-3">{STATUS_LABEL[appointment.status] ?? appointment.status}</td>
                  <td className="p-3 text-right">
                    <Link className="underline" href={`/specialist/appointments/${appointment.id}`}>Otwórz</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      </>
      )}
    </div>
  );
}
