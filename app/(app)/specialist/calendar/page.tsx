"use client";

import useSWR from "swr";
import * as React from "react";
import { useRouter } from "next/navigation";
import { AppointmentCalendar, startOfGrid } from "@/components/appointment-calendar";
import { SpecialistBookAppointmentDialog } from "@/components/specialist-book-appointment-dialog";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function SpecialistCalendarPage() {
  const router = useRouter();
  const [anchor, setAnchor] = React.useState(() => new Date());

  const range = React.useMemo(() => {
    const from = startOfGrid(anchor);
    const to = new Date(from);
    to.setDate(to.getDate() + 42);
    return { from, to };
  }, [anchor]);

  const { data, mutate, isLoading } = useSWR(
    `/api/specialist/appointments?from=${range.from.toISOString()}&to=${range.to.toISOString()}`,
    fetcher,
  );

  const appointments = data?.appointments ?? [];
  const services = data?.services ?? [];
  const products = data?.products ?? [];

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [defaultDate, setDefaultDate] = React.useState<Date | null>(null);

  function openAdd(date?: Date) {
    setDefaultDate(date ?? new Date());
    setDialogOpen(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Kalendarz</h1>
        <div className="text-sm text-zinc-500">Twoje wizyty</div>
      </div>

      <AppointmentCalendar
        anchor={anchor}
        onAnchorChange={setAnchor}
        appointments={appointments}
        isLoading={isLoading}
        onAdd={openAdd}
        onOpenAppointment={(id) => router.push(`/specialist/appointments/${id}`)}
      />

      <SpecialistBookAppointmentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        services={services}
        products={products}
        defaultDate={defaultDate}
        onCreated={() => mutate()}
      />
    </div>
  );
}
