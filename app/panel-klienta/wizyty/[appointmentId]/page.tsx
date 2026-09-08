import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, User as UserIcon, Stethoscope, Syringe, Wallet, Image as ImageIcon } from "lucide-react";
import { getPatientAuth } from "@/lib/patient-auth";
import { prisma } from "@/lib/db";
import { formatPLNFromGrosze } from "@/lib/money";
import { appointmentStatusLabel } from "@/lib/appointment-status";
import { AppointmentPhotos } from "@/components/appointment-photos";
import { PatientPageShell } from "../../PatientPageShell";

export const dynamic = "force-dynamic";

const UNIT_LABELS: Record<string, string> = {
  UNIT: "szt.",
  ML: "ml",
  MG: "mg",
  G: "g",
  AMPULE: "ampułka",
  BOTOX_UNIT: "jedn. botox",
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "Gotówka",
  CARD: "Karta",
  VOUCHER: "Voucher",
};

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

export default async function PatientAppointmentCardPage({ params }: { params: { appointmentId: string } }) {
  const auth = await getPatientAuth();
  if (!auth) redirect("/panel-klienta/logowanie");

  const patient = await prisma.patient.findUnique({ where: { id: auth.id }, select: { name: true } });
  if (!patient) redirect("/panel-klienta/logowanie");

  // Ważne: wizyta jest pobierana WYŁĄCZNIE po (id, patientId) należącym do
  // zalogowanego pacjenta — nie da się w ten sposób podejrzeć cudzej karty
  // wizyty, nawet znając jej id.
  const appointment = await prisma.appointment.findFirst({
    where: { id: params.appointmentId, patientId: auth.id, deletedAt: null },
    select: {
      id: true,
      startsAt: true,
      status: true,
      priceEstimate: true,
      priceFinal: true,
      customServiceName: true,
      photoBefore: true,
      photoAfter: true,
      patient: { select: { name: true } },
      specialist: { select: { name: true, jobTitle: true, specialization: true } },
      service: { select: { name: true } },
      location: { select: { name: true } },
      consumptions: {
        where: { status: { not: "REJECTED" } },
        select: { quantity: true, unit: true, product: { select: { name: true } } },
      },
      payments: { select: { method: true, amount: true } },
    },
  });

  if (!appointment) notFound();

  const upcomingCount = await prisma.appointment.count({
    where: { patientId: auth.id, deletedAt: null, status: { not: "CANCELED" }, startsAt: { gte: new Date() } },
  });

  const serviceName = appointment.customServiceName || appointment.service?.name || "Zabieg";
  const price = appointment.priceFinal ?? appointment.priceEstimate;
  const paidTotal = appointment.payments.reduce((sum, p) => sum + p.amount, 0);
  const hasPhotos = Boolean(appointment.photoBefore || appointment.photoAfter);

  return (
    <PatientPageShell patientName={patient.name} upcomingCount={upcomingCount}>
      <Link
        href="/panel-klienta"
        className="mb-5 inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-800"
      >
        <ArrowLeft className="h-4 w-4" /> Wróć do panelu
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 sm:text-3xl">{serviceName}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {formatDate(appointment.startsAt)}, {formatTime(appointment.startsAt)}
          </p>
        </div>
        <span className="inline-block rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-600">
          {appointmentStatusLabel(appointment.status, appointment.startsAt)}
        </span>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {/* Dane wizyty */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-900">
            <Stethoscope className="h-4 w-4 text-emerald-600" /> Dane wizyty
          </div>
          <dl className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="flex items-center gap-1.5 text-zinc-500">
                <UserIcon className="h-3.5 w-3.5" /> Pacjent
              </dt>
              <dd className="font-medium text-zinc-900">{appointment.patient.name}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="flex items-center gap-1.5 text-zinc-500">
                <UserIcon className="h-3.5 w-3.5" /> Lekarz / specjalista
              </dt>
              <dd className="text-right font-medium text-zinc-900">
                {appointment.specialist.name}
                {appointment.specialist.jobTitle || appointment.specialist.specialization ? (
                  <div className="text-xs font-normal text-zinc-500">
                    {appointment.specialist.jobTitle || appointment.specialist.specialization}
                  </div>
                ) : null}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-zinc-500">Zabieg</dt>
              <dd className="font-medium text-zinc-900">{serviceName}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-zinc-500">Lokalizacja</dt>
              <dd className="font-medium text-zinc-900">{appointment.location?.name ?? "—"}</dd>
            </div>
          </dl>
        </div>

        {/* Płatność */}
        <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-5 shadow-sm sm:p-6">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-900">
            <Wallet className="h-4 w-4 text-emerald-600" /> Płatność
          </div>
          {price !== null && price !== undefined ? (
            <div className="text-2xl font-bold text-emerald-700">{formatPLNFromGrosze(price)}</div>
          ) : (
            <div className="text-sm text-zinc-500">Cena nie została jeszcze ustalona</div>
          )}

          {appointment.payments.length > 0 ? (
            <div className="mt-3 space-y-1.5 border-t border-emerald-100 pt-3 text-sm">
              {appointment.payments.map((p, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-zinc-600">{PAYMENT_METHOD_LABELS[p.method] ?? p.method}</span>
                  <span className="font-medium text-zinc-900">{formatPLNFromGrosze(p.amount)}</span>
                </div>
              ))}
              {price !== null && price !== undefined && paidTotal < price ? (
                <div className="flex items-center justify-between pt-1 text-amber-700">
                  <span>Pozostało do zapłaty</span>
                  <span className="font-semibold">{formatPLNFromGrosze(price - paidTotal)}</span>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="mt-3 border-t border-emerald-100 pt-3 text-sm text-zinc-500">
              Brak zarejestrowanej płatności.
            </div>
          )}
        </div>
      </div>

      {/* Zużyte preparaty */}
      <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-900">
          <Syringe className="h-4 w-4 text-emerald-600" /> Zużyte preparaty
        </div>
        {appointment.consumptions.length === 0 ? (
          <p className="text-sm text-zinc-500">Brak zarejestrowanych preparatów dla tej wizyty.</p>
        ) : (
          <ul className="divide-y divide-zinc-100 text-sm">
            {appointment.consumptions.map((c, i) => (
              <li key={i} className="flex items-center justify-between py-2">
                <span className="text-zinc-700">{c.product.name}</span>
                <span className="font-medium text-zinc-900">
                  {c.quantity.toString()} {UNIT_LABELS[c.unit] ?? c.unit}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Zdjęcia przed/po */}
      {hasPhotos ? (
        <div className="mt-6">
          <AppointmentPhotos
            appointmentId={appointment.id}
            photoBefore={appointment.photoBefore}
            photoAfter={appointment.photoAfter}
            readOnly
          />
        </div>
      ) : (
        <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-zinc-900">
            <ImageIcon className="h-4 w-4 text-emerald-600" /> Zdjęcia przed / po
          </div>
          <p className="text-sm text-zinc-500">Klinika nie dodała jeszcze zdjęć dla tej wizyty.</p>
        </div>
      )}
    </PatientPageShell>
  );
}
