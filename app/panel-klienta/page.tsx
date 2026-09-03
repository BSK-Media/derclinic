import Image from "next/image";
import { redirect } from "next/navigation";
import { CalendarDays, MapPin, User as UserIcon } from "lucide-react";
import { getPatientAuth } from "@/lib/patient-auth";
import { prisma } from "@/lib/db";
import { formatPLNFromGrosze } from "@/lib/money";
import { appointmentStatusLabel } from "@/lib/appointment-status";
import { LogoutButton } from "./LogoutButton";

export const dynamic = "force-dynamic";

function formatDate(date: Date) {
  return date.toLocaleDateString("pl-PL", {
    timeZone: "Europe/Warsaw",
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatTime(date: Date) {
  return date.toLocaleTimeString("pl-PL", { timeZone: "Europe/Warsaw", hour: "2-digit", minute: "2-digit" });
}

type AppointmentRowData = {
  id: string;
  startsAt: Date;
  status: string;
  priceFinal: number | null;
  priceEstimate: number | null;
  customServiceName: string | null;
  service: { name: string } | null;
  specialist: { name: string } | null;
  location: { name: string } | null;
};

function AppointmentRow({ appointment, highlight = false }: { appointment: AppointmentRowData; highlight?: boolean }) {
  const serviceName = appointment.customServiceName || appointment.service?.name || "Zabieg";
  const price = appointment.priceFinal ?? appointment.priceEstimate;
  return (
    <div className={"rounded-2xl border bg-white p-4 shadow-sm sm:p-5 " + (highlight ? "border-emerald-200" : "")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-medium text-zinc-900">{serviceName}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
            <span className="flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5" /> {formatDate(appointment.startsAt)}, {formatTime(appointment.startsAt)}
            </span>
            <span className="flex items-center gap-1">
              <UserIcon className="h-3.5 w-3.5" /> {appointment.specialist?.name ?? "—"}
            </span>
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" /> {appointment.location?.name ?? "—"}
            </span>
          </div>
        </div>
        <div className="text-right">
          <span className="inline-block rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600">
            {appointmentStatusLabel(appointment.status, appointment.startsAt)}
          </span>
          {price !== null && price !== undefined ? (
            <div className="mt-1.5 text-sm font-semibold text-emerald-700">{formatPLNFromGrosze(price)}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default async function PatientDashboardPage() {
  const patient = await getPatientAuth();
  if (!patient) redirect("/panel-klienta/logowanie");

  const appointments = await prisma.appointment.findMany({
    where: { patientId: patient.id, deletedAt: null },
    orderBy: { startsAt: "desc" },
    select: {
      id: true,
      startsAt: true,
      status: true,
      priceFinal: true,
      priceEstimate: true,
      customServiceName: true,
      service: { select: { name: true } },
      specialist: { select: { name: true } },
      location: { select: { name: true } },
    },
  });

  const now = new Date();
  const upcoming = appointments.filter((a) => a.startsAt.getTime() >= now.getTime() && a.status !== "CANCELED");
  const past = appointments.filter((a) => a.startsAt.getTime() < now.getTime() || a.status === "CANCELED");

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Image src="/derclinic-logo.webp" alt="DerClinic" width={140} height={35} />
          <LogoutButton />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-6 rounded-2xl border bg-white p-5 shadow-sm sm:p-6">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Witaj</div>
          <div className="mt-1 text-xl font-semibold text-zinc-900">{patient.name}</div>
          <div className="mt-1 text-sm text-zinc-500">
            {patient.phone ?? "—"} {patient.email ? `• ${patient.email}` : ""}
          </div>
        </div>

        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">Nadchodzące wizyty</h2>
          {upcoming.length === 0 ? (
            <div className="rounded-2xl border border-dashed bg-white p-6 text-center text-sm text-zinc-500">
              Brak zaplanowanych wizyt.
            </div>
          ) : (
            <div className="space-y-3">
              {upcoming.map((appt) => (
                <AppointmentRow key={appt.id} appointment={appt} highlight />
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">Historia wizyt</h2>
          {past.length === 0 ? (
            <div className="rounded-2xl border border-dashed bg-white p-6 text-center text-sm text-zinc-500">
              Brak wcześniejszych wizyt.
            </div>
          ) : (
            <div className="space-y-3">
              {past.map((appt) => (
                <AppointmentRow key={appt.id} appointment={appt} />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
