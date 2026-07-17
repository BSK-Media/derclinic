"use client";

import * as React from "react";
import Link from "next/link";
import useSWR from "swr";
import { Input } from "@/components/ui/input";
import { AppointmentCalendar, startOfGrid } from "@/components/appointment-calendar";
import { useRouter } from "next/navigation";
import { appointmentStatusLabel, effectiveAppointmentStatus } from "@/lib/appointment-status";

const fetcher = (url: string) => fetch(url).then((response) => response.json());

const UNIT_LABELS: Record<string, string> = {
  ML: "ml",
  MG: "mg",
  G: "g",
  UNIT: "szt.",
  AMPULE: "amp.",
  BOTOX_UNIT: "j. botoksu",
};

function formatPreparations(consumptions: any[] | undefined) {
  if (!consumptions || consumptions.length === 0) return null;
  return consumptions
    .map((c) =>
      `${c.product?.name ?? "?"} × ${Number(c.quantity)} ${UNIT_LABELS[c.unit] ?? ""}`.trim(),
    )
    .join(", ");
}

function toDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

type SpecialistAppointmentsPageProps = {
  searchParams?: {
    view?: string | string[];
  };
};

export default function SpecialistAppointmentsPage({
  searchParams,
}: SpecialistAppointmentsPageProps) {
  const router = useRouter();
  const [clock, setClock] = React.useState(() => new Date());
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
      router.replace(`/specialist/appointments?view=${nextView}`, { scroll: false });
    },
    [router],
  );

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
  const { data, isLoading } = useSWR(
    view === "calendar"
      ? `/api/specialist/appointments?from=${calendarRange.from.toISOString()}&to=${calendarRange.to.toISOString()}`
      : `/api/specialist/appointments?from=${from}&to=${to}`,
    fetcher,
  );

  const appointments = data?.appointments ?? [];

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return appointments;
    return appointments.filter((a: any) => {
      const serviceName = (a.customServiceName || a.service?.name || "").toLowerCase();
      return a.patient?.name?.toLowerCase().includes(q) || serviceName.includes(q);
    });
  }, [appointments, search]);

  React.useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Wizyty</h1>
        <div className="flex items-center gap-3">
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
      </div>

      {view === "calendar" ? (
        <AppointmentCalendar
          anchor={anchor}
          onAnchorChange={setAnchor}
          appointments={appointments}
          isLoading={isLoading}
          showAddButton={false}
          onOpenAppointment={(id: string) => router.push(`/specialist/appointments/${id}`)}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-[220px] flex-1">
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
                onChange={(event) => setFrom(event.target.value)}
                className="w-40"
              />
              <span className="text-zinc-400">–</span>
              <Input
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
                className="w-40"
              />
            </div>
            <div className="text-sm text-zinc-500">
              {isLoading ? "Ładowanie…" : `Wyniki: ${filtered.length}`}
            </div>
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
                    <th className="p-3">Notatka</th>
                    <th className="p-3">Zużyte preparaty</th>
                    <th className="p-3">Status</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {!isLoading && filtered.length === 0 ? (
                    <tr>
                      <td className="p-6 text-center text-zinc-500" colSpan={8}>
                        Brak wizyt.
                      </td>
                    </tr>
                  ) : null}
                  {filtered.map((appointment: any) => {
                    const effectiveStatus =
                      appointment.approvalStatus === "REJECTED"
                        ? appointment.status
                        : effectiveAppointmentStatus(
                            appointment.status,
                            appointment.startsAt,
                            clock,
                          );
                    return (
                      <tr
                        key={appointment.id}
                        className="border-t hover:bg-zinc-50 dark:hover:bg-zinc-900/40"
                      >
                        <td className="p-3">
                          {new Date(appointment.startsAt).toLocaleDateString("pl-PL")}
                        </td>
                        <td className="p-3">
                          {new Date(appointment.startsAt).toLocaleTimeString("pl-PL", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="p-3 font-medium">{appointment.patient.name}</td>
                        <td className="p-3">
                          {appointment.customServiceName || appointment.service.name}
                        </td>
                        <td className="max-w-56 p-3 text-zinc-500">
                          <span className="line-clamp-2">{appointment.note?.trim() || "—"}</span>
                        </td>
                        <td className="max-w-64 p-3 text-zinc-500">
                          <span className="line-clamp-2">
                            {formatPreparations(appointment.consumptions) ?? "—"}
                          </span>
                        </td>
                        <td className="p-3">
                          <div
                            className={
                              effectiveStatus === "AWAITING"
                                ? "inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-500/10 dark:text-amber-300"
                                : undefined
                            }
                          >
                            {appointmentStatusLabel(effectiveStatus)}
                          </div>
                          {(appointment as any).approvalStatus === "PENDING" ? (
                            <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                              Oczekuje na akceptację recepcji
                            </span>
                          ) : null}
                          {(appointment as any).approvalStatus === "REJECTED" ? (
                            <span className="mt-1 inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 dark:bg-red-500/10 dark:text-red-300">
                              Odrzucona - nie liczy się do rozliczenia
                            </span>
                          ) : null}
                        </td>
                        <td className="p-3 text-right">
                          <Link
                            className="underline"
                            href={`/specialist/appointments/${appointment.id}`}
                          >
                            Otwórz
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
