"use client";

import useSWR from "swr";
import * as React from "react";
import { useRouter } from "next/navigation";
import { AppointmentCalendar, startOfGrid } from "@/components/appointment-calendar";
import { AdminBookAppointmentDialog } from "@/components/admin-book-appointment-dialog";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function AdminCalendarPage() {
  const router = useRouter();
  const [anchor, setAnchor] = React.useState(() => new Date());

  const range = React.useMemo(() => {
    const from = startOfGrid(anchor);
    const to = new Date(from);
    to.setDate(to.getDate() + 42);
    return { from, to };
  }, [anchor]);

  const { data, mutate, isLoading } = useSWR(
    `/api/admin/appointments?from=${range.from.toISOString()}&to=${range.to.toISOString()}`,
    fetcher,
  );

  const appointments = data?.appointments ?? [];
  const patients = data?.patients ?? [];
  const specialists = data?.specialists ?? [];
  const services = data?.services ?? [];

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [defaultDate, setDefaultDate] = React.useState<Date | null>(null);

  function openAdd(date?: Date) {
    setDefaultDate(date ?? null);
    setDialogOpen(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Kalendarz</h1>
        <div className="text-sm text-zinc-500">Wszystkie wizyty — wszyscy specjaliści</div>
      </div>

      <AppointmentCalendar
        anchor={anchor}
        onAnchorChange={setAnchor}
        appointments={appointments}
        isLoading={isLoading}
        onAdd={openAdd}
        onOpenAppointment={(id) => router.push(`/admin/appointments/${id}`)}
        showSpecialist
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
