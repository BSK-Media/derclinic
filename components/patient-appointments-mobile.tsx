"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRight, SlidersHorizontal } from "lucide-react";
import { appointmentStatusLabel } from "@/lib/appointment-status";
import { formatPLNFromGrosze } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type PatientAppointment = {
  id: string;
  startsAt: string;
  serviceName: string;
  specialistName: string;
  status: string;
  price: number | null;
  paid: number;
};

function toDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatMobileDate(value: string) {
  if (!value) return "";

  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return "";

  return new Intl.DateTimeFormat("pl-PL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}

export function PatientAppointmentsMobile({
  appointments,
}: {
  appointments: PatientAppointment[];
}) {
  const [query, setQuery] = React.useState("");
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  const [service, setService] = React.useState("ALL");
  const [specialist, setSpecialist] = React.useState("ALL");
  const [filtersOpen, setFiltersOpen] = React.useState(false);

  const services = React.useMemo(
    () =>
      Array.from(new Set(appointments.map((appointment) => appointment.serviceName))).sort(
        (first, second) => first.localeCompare(second, "pl", { sensitivity: "base" }),
      ),
    [appointments],
  );
  const specialists = React.useMemo(
    () =>
      Array.from(new Set(appointments.map((appointment) => appointment.specialistName))).sort(
        (first, second) => first.localeCompare(second, "pl", { sensitivity: "base" }),
      ),
    [appointments],
  );

  const filteredAppointments = React.useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("pl");

    return appointments.filter((appointment) => {
      const startsAt = new Date(appointment.startsAt);
      const appointmentDate = toDateInput(startsAt);
      const searchableText = [
        appointment.serviceName,
        appointment.specialistName,
        appointmentStatusLabel(appointment.status, appointment.startsAt),
        startsAt.toLocaleDateString("pl-PL"),
      ]
        .join(" ")
        .toLocaleLowerCase("pl");

      const matchesQuery = !normalizedQuery || searchableText.includes(normalizedQuery);
      const matchesDateFrom = !dateFrom || appointmentDate >= dateFrom;
      const matchesDateTo = !dateTo || appointmentDate <= dateTo;
      const matchesService = service === "ALL" || appointment.serviceName === service;
      const matchesSpecialist = specialist === "ALL" || appointment.specialistName === specialist;

      return (
        matchesQuery && matchesDateFrom && matchesDateTo && matchesService && matchesSpecialist
      );
    });
  }, [appointments, dateFrom, dateTo, query, service, specialist]);

  const activeFilters =
    Number(Boolean(dateFrom)) +
    Number(Boolean(dateTo)) +
    Number(service !== "ALL") +
    Number(specialist !== "ALL");

  return (
    <div className="md:hidden">
      <div className="space-y-3 border-b p-4">
        <div className="flex items-stretch gap-2">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Szukaj zabiegu lub specjalisty..."
            className="min-w-0 flex-1 rounded-xl text-base"
          />
          <Button
            type="button"
            variant="outline"
            className="relative h-10 w-11 shrink-0 px-0"
            onClick={() => setFiltersOpen((open) => !open)}
            aria-label="Pokaż filtry historii wizyt"
            aria-expanded={filtersOpen}
          >
            <SlidersHorizontal className="h-4 w-4" />
            {activeFilters > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-600 px-1 text-[10px] font-semibold text-white">
                {activeFilters}
              </span>
            ) : null}
          </Button>
        </div>

        {filtersOpen ? (
          <div className="w-full min-w-0 max-w-full space-y-4 overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-lg dark:border-white/10 dark:bg-[#0b1220]">
            <div className="w-full min-w-0 space-y-4">
              <div className="w-full min-w-0 max-w-full space-y-2 overflow-hidden">
                <Label htmlFor="patient-appointment-date-from">Data od</Label>
                <div className="relative h-12 w-full min-w-0 max-w-full overflow-hidden rounded-xl border border-zinc-200 bg-white focus-within:ring-2 focus-within:ring-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:focus-within:ring-zinc-700">
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 flex items-center justify-center px-10 text-center text-base text-zinc-950 dark:text-zinc-50"
                  >
                    {formatMobileDate(dateFrom)}
                  </span>
                  <Input
                    id="patient-appointment-date-from"
                    type="date"
                    value={dateFrom}
                    onChange={(event) => setDateFrom(event.target.value)}
                    max={dateTo || undefined}
                    className="absolute inset-0 h-full w-full cursor-pointer rounded-none border-0 bg-transparent p-0 opacity-0 focus:ring-0"
                  />
                </div>
              </div>

              <div className="w-full min-w-0 max-w-full space-y-2 overflow-hidden">
                <Label htmlFor="patient-appointment-date-to">Data do</Label>
                <div className="relative h-12 w-full min-w-0 max-w-full overflow-hidden rounded-xl border border-zinc-200 bg-white focus-within:ring-2 focus-within:ring-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:focus-within:ring-zinc-700">
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 flex items-center justify-center px-10 text-center text-base text-zinc-950 dark:text-zinc-50"
                  >
                    {formatMobileDate(dateTo)}
                  </span>
                  <Input
                    id="patient-appointment-date-to"
                    type="date"
                    value={dateTo}
                    onChange={(event) => setDateTo(event.target.value)}
                    min={dateFrom || undefined}
                    className="absolute inset-0 h-full w-full cursor-pointer rounded-none border-0 bg-transparent p-0 opacity-0 focus:ring-0"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Zabieg</Label>
              <Select value={service} onValueChange={setService}>
                <SelectTrigger>
                  <SelectValue placeholder="Wszystkie zabiegi" />
                </SelectTrigger>
                <SelectContent className="w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-2rem)] !bg-white dark:!bg-[#0b1220]">
                  <SelectItem value="ALL">Wszystkie zabiegi</SelectItem>
                  {services.map((serviceName) => (
                    <SelectItem
                      key={serviceName}
                      value={serviceName}
                      className="min-w-0 whitespace-normal break-words [&>span]:whitespace-normal [&>span]:break-words"
                    >
                      {serviceName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Specjalista</Label>
              <Select value={specialist} onValueChange={setSpecialist}>
                <SelectTrigger>
                  <SelectValue placeholder="Wszyscy specjaliści" />
                </SelectTrigger>
                <SelectContent className="w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-2rem)] !bg-white dark:!bg-[#0b1220]">
                  <SelectItem value="ALL">Wszyscy specjaliści</SelectItem>
                  {specialists.map((specialistName) => (
                    <SelectItem
                      key={specialistName}
                      value={specialistName}
                      className="min-w-0 whitespace-normal break-words [&>span]:whitespace-normal [&>span]:break-words"
                    >
                      {specialistName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setDateFrom("");
                  setDateTo("");
                  setService("ALL");
                  setSpecialist("ALL");
                }}
                disabled={activeFilters === 0}
              >
                Wyczyść filtry
              </Button>
              <Button type="button" size="sm" onClick={() => setFiltersOpen(false)}>
                Pokaż wyniki
              </Button>
            </div>
          </div>
        ) : null}

        <div className="text-xs text-slate-500">Liczba wizyt: {filteredAppointments.length}</div>
      </div>

      <div className="space-y-3 p-4">
        {appointments.length === 0 ? (
          <div className="rounded-2xl border bg-white p-5 text-center text-sm text-zinc-500 dark:bg-[#0b1220]">
            Brak wizyt.
          </div>
        ) : null}

        {appointments.length > 0 && filteredAppointments.length === 0 ? (
          <div className="rounded-2xl border bg-white p-5 text-center text-sm text-zinc-500 dark:bg-[#0b1220]">
            Brak wizyt pasujących do wyszukiwania lub wybranych filtrów.
          </div>
        ) : null}

        {filteredAppointments.map((appointment) => {
          const startsAt = new Date(appointment.startsAt);

          return (
            <div
              key={appointment.id}
              className="min-w-0 overflow-hidden rounded-2xl border bg-white p-4 shadow-sm dark:bg-[#0b1220]"
            >
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Zabieg
                  </div>
                  <div className="mt-1 break-words text-base font-semibold leading-6 text-zinc-950 dark:text-zinc-50">
                    {appointment.serviceName}
                  </div>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-2 text-right">
                  <div className="whitespace-nowrap text-xs text-zinc-500 dark:text-zinc-400">
                    <div>
                      {startsAt.toLocaleDateString("pl-PL", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })}
                    </div>
                    <div className="mt-0.5">
                      {startsAt.toLocaleTimeString("pl-PL", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                  <Link
                    href={`/admin/appointments/${appointment.id}`}
                    title="Szczegóły wizyty"
                    aria-label="Szczegóły wizyty"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 text-zinc-500 transition hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-white/5"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </Link>
                </div>
              </div>

              <div className="mt-3 border-t pt-3">
                <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Specjalista
                </div>
                <div className="mt-1 break-words text-sm text-zinc-700 dark:text-zinc-200">
                  {appointment.specialistName}
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between gap-3 border-t pt-3">
                <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Status
                </span>
                <span className="text-right text-sm font-medium text-zinc-800 dark:text-zinc-100">
                  {appointmentStatusLabel(appointment.status, appointment.startsAt)}
                </span>
              </div>

              <div className="relative mt-3 grid grid-cols-2 overflow-hidden rounded-xl border border-zinc-200 text-sm dark:border-zinc-800">
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-zinc-200 dark:bg-zinc-800"
                />
                <div className="min-w-0 p-3">
                  <div className="text-xs text-zinc-500">Cena</div>
                  <div className="mt-1 break-words font-semibold tabular-nums">
                    {formatPLNFromGrosze(appointment.price)}
                  </div>
                </div>
                <div className="min-w-0 p-3 text-right">
                  <div className="text-xs text-zinc-500">Zapłacono</div>
                  <div className="mt-1 break-words font-semibold tabular-nums">
                    {appointment.paid ? formatPLNFromGrosze(appointment.paid) : "—"}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
