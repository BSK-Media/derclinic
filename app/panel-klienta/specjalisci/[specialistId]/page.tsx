import Link from "next/link";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Clock, User as UserIcon, ArrowRight } from "lucide-react";
import { getPatientAuth } from "@/lib/patient-auth";
import { prisma } from "@/lib/db";
import { PatientPageShell } from "../../PatientPageShell";

export const dynamic = "force-dynamic";

function formatDuration(min: number) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const rest = min % 60;
  return rest ? `${h} godz. ${rest} min` : `${h} godz.`;
}

export default async function PatientSpecialistPage({ params }: { params: { specialistId: string } }) {
  const auth = await getPatientAuth();
  if (!auth) redirect(`/panel-klienta/logowanie`);

  const [patient, specialist] = await Promise.all([
    prisma.patient.findUnique({ where: { id: auth.id }, select: { name: true } }),
    prisma.user.findFirst({
      where: { id: params.specialistId, role: "SPECIALIST", isVisible: true },
      select: {
        id: true,
        name: true,
        avatarUrl: true,
        jobTitle: true,
        specialization: true,
        bio: true,
        assignedServices: {
          select: {
            service: { select: { id: true, name: true, category: true, durationMin: true, price: true } },
          },
        },
      },
    }),
  ]);

  if (!patient) redirect("/panel-klienta/logowanie");
  if (!specialist) notFound();

  const upcomingCount = await prisma.appointment.count({
    where: { patientId: auth.id, deletedAt: null, status: { not: "CANCELED" }, startsAt: { gte: new Date() } },
  });

  const byCategory = new Map<string, { id: string; name: string; durationMin: number }[]>();
  for (const { service } of specialist.assignedServices) {
    const key = service.category || "Pozostałe zabiegi";
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key)!.push(service);
  }

  return (
    <PatientPageShell patientName={patient.name} upcomingCount={upcomingCount}>
      <Link
        href="/panel-klienta"
        className="mb-5 inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-800"
      >
        <ArrowLeft className="h-4 w-4" /> Wróć do panelu
      </Link>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center gap-4">
          <span className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full bg-zinc-100">
            {specialist.avatarUrl ? (
              <Image src={specialist.avatarUrl} alt={specialist.name} fill className="object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-zinc-400">
                <UserIcon className="h-8 w-8" />
              </span>
            )}
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-zinc-900 sm:text-2xl">{specialist.name}</h1>
            {specialist.jobTitle || specialist.specialization ? (
              <p className="mt-0.5 text-sm text-zinc-500">{specialist.jobTitle || specialist.specialization}</p>
            ) : null}
          </div>
        </div>

        {specialist.bio ? (
          <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-zinc-700">{specialist.bio}</p>
        ) : null}
      </div>

      <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="text-sm font-semibold text-zinc-900">Zabiegi wykonywane przez {specialist.name}</div>
        <p className="mb-4 text-xs text-zinc-500">Wybierz zabieg, żeby zobaczyć opis i cenę</p>

        {specialist.assignedServices.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-200 p-5 text-center text-sm text-zinc-500">
            Brak przypisanych zabiegów.
          </div>
        ) : (
          <div className="space-y-5">
            {[...byCategory.entries()].map(([category, services]) => (
              <div key={category}>
                <div className="mb-2 text-xs font-medium text-zinc-400">{category}</div>
                <div className="divide-y divide-zinc-100">
                  {services.map((service) => (
                    <Link
                      key={service.id}
                      href={`/panel-klienta/zabiegi/${service.id}`}
                      className="flex items-center justify-between gap-3 py-3 transition hover:bg-zinc-50"
                    >
                      <span className="font-medium text-zinc-900">{service.name}</span>
                      <span className="flex shrink-0 items-center gap-3 text-xs text-zinc-500">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" /> {formatDuration(service.durationMin)}
                        </span>
                        <ArrowRight className="h-3.5 w-3.5 text-zinc-300" />
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </PatientPageShell>
  );
}
