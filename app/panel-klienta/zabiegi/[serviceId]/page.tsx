import Link from "next/link";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Clock, MapPin, User as UserIcon, CalendarPlus, ArrowRight } from "lucide-react";
import { getPatientAuth } from "@/lib/patient-auth";
import { prisma } from "@/lib/db";
import { formatPLNFromGrosze } from "@/lib/money";
import { PatientPageShell } from "../../PatientPageShell";

export const dynamic = "force-dynamic";

function formatDuration(min: number) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const rest = min % 60;
  return rest ? `${h} godz. ${rest} min` : `${h} godz.`;
}

export default async function PatientServicePage({ params }: { params: { serviceId: string } }) {
  const auth = await getPatientAuth();
  if (!auth) redirect(`/panel-klienta/logowanie`);

  const [patient, service] = await Promise.all([
    prisma.patient.findUnique({ where: { id: auth.id }, select: { name: true } }),
    prisma.service.findUnique({
      where: { id: params.serviceId },
      select: {
        id: true,
        name: true,
        category: true,
        description: true,
        durationMin: true,
        price: true,
        specialistAssignments: {
          select: {
            specialist: {
              select: {
                id: true,
                name: true,
                avatarUrl: true,
                jobTitle: true,
                specialization: true,
                isVisible: true,
                assignedLocation: { select: { name: true } },
              },
            },
          },
        },
      },
    }),
  ]);

  if (!patient) redirect("/panel-klienta/logowanie");
  if (!service) notFound();

  const upcomingCount = await prisma.appointment.count({
    where: { patientId: auth.id, deletedAt: null, status: { not: "CANCELED" }, startsAt: { gte: new Date() } },
  });

  const specialists = service.specialistAssignments.map((a) => a.specialist).filter((s) => s.isVisible);
  const locationName = specialists[0]?.assignedLocation?.name ?? null;

  return (
    <PatientPageShell patientName={patient.name} upcomingCount={upcomingCount}>
      <Link
        href="/panel-klienta"
        className="mb-5 inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-800"
      >
        <ArrowLeft className="h-4 w-4" /> Wróć do panelu
      </Link>

      <h1 className="text-2xl font-bold text-zinc-900 sm:text-3xl">{service.name}</h1>
      {service.category ? (
        <span className="mt-2 inline-block rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700">
          {service.category}
        </span>
      ) : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {/* Opis zabiegu */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6 lg:col-span-2">
          <div className="mb-3 text-sm font-semibold text-zinc-900">Opis zabiegu</div>
          {service.description ? (
            <p className="whitespace-pre-line text-sm leading-relaxed text-zinc-700">{service.description}</p>
          ) : (
            <p className="text-sm text-zinc-400">Opis tego zabiegu pojawi się wkrótce.</p>
          )}

          <div className="mt-5 grid grid-cols-2 gap-4 border-t border-zinc-100 pt-5">
            <div>
              <div className="mb-1 flex items-center gap-1.5 text-xs text-zinc-500">
                <Clock className="h-3.5 w-3.5" /> Czas trwania
              </div>
              <div className="text-sm font-semibold text-zinc-900">{formatDuration(service.durationMin)}</div>
            </div>
            {locationName ? (
              <div>
                <div className="mb-1 flex items-center gap-1.5 text-xs text-zinc-500">
                  <MapPin className="h-3.5 w-3.5" /> Lokalizacja
                </div>
                <div className="text-sm font-semibold text-zinc-900">{locationName}</div>
              </div>
            ) : null}
          </div>
        </div>

        {/* Cena / CTA */}
        <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-5 shadow-sm sm:p-6">
          <div className="text-sm font-semibold text-zinc-900">Cena zabiegu</div>
          {service.price ? (
            <>
              <div className="mt-3 text-3xl font-bold text-emerald-700">{formatPLNFromGrosze(service.price)}</div>
              <div className="text-xs text-zinc-500">Cena za jedną wizytę</div>
            </>
          ) : (
            <div className="mt-3 text-sm text-zinc-500">Cena ustalana indywidualnie</div>
          )}
          <Link
            href={`/book?serviceId=${service.id}`}
            className="mt-4 flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
          >
            <CalendarPlus className="h-4 w-4" /> Umów wizytę
          </Link>
          <div className="mt-2 text-center text-xs text-zinc-500">Wybierz lekarza i dogodny termin</div>
        </div>
      </div>

      {/* Lekarze wykonujący zabieg */}
      <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="text-sm font-semibold text-zinc-900">Lekarze wykonujący zabieg</div>
        <p className="mb-4 text-xs text-zinc-500">Poznaj specjalistów wykonujących ten zabieg</p>

        {specialists.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-200 p-5 text-center text-sm text-zinc-500">
            Brak przypisanych specjalistów.
          </div>
        ) : (
          <div className="divide-y divide-zinc-100">
            {specialists.map((s) => (
              <div key={s.id} className="flex items-center gap-4 py-3.5 first:pt-0 last:pb-0">
                <Link href={`/panel-klienta/specjalisci/${s.id}`} className="flex min-w-0 flex-1 items-center gap-4">
                  <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full bg-zinc-100">
                    {s.avatarUrl ? (
                      <Image src={s.avatarUrl} alt={s.name} fill className="object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-zinc-400">
                        <UserIcon className="h-5 w-5" />
                      </span>
                    )}
                  </span>
                  <div className="min-w-0">
                    <div className="font-medium text-zinc-900 hover:text-emerald-700">{s.name}</div>
                    <div className="truncate text-xs text-zinc-500">{s.jobTitle || s.specialization || ""}</div>
                  </div>
                </Link>
                <Link
                  href={`/panel-klienta/specjalisci/${s.id}`}
                  className="flex shrink-0 items-center gap-1.5 rounded-xl border border-emerald-600 px-3.5 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50"
                >
                  Przeczytaj o lekarzu <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </PatientPageShell>
  );
}
