import Link from "next/link";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Clock, User as UserIcon } from "lucide-react";
import { getPatientAuth } from "@/lib/patient-auth";
import { prisma } from "@/lib/db";
import { formatPLNFromGrosze } from "@/lib/money";

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

  const service = await prisma.service.findUnique({
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
            },
          },
        },
      },
    },
  });

  if (!service) notFound();

  const specialists = service.specialistAssignments.map((a) => a.specialist).filter((s) => s.isVisible);

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <Link
          href="/panel-klienta"
          className="mb-5 inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-800"
        >
          <ArrowLeft className="h-4 w-4" /> Wróć do panelu
        </Link>

        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
          {service.category ? (
            <span className="mb-2 inline-block rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
              {service.category}
            </span>
          ) : null}
          <h1 className="text-xl font-bold text-zinc-900 sm:text-2xl">{service.name}</h1>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-500">
            <span className="flex items-center gap-1.5">
              <Clock className="h-4 w-4" /> {formatDuration(service.durationMin)}
            </span>
            {service.price ? (
              <span className="font-semibold text-emerald-700">{formatPLNFromGrosze(service.price)}</span>
            ) : null}
          </div>

          {service.description ? (
            <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-zinc-700">{service.description}</p>
          ) : (
            <p className="mt-4 text-sm text-zinc-400">Opis tego zabiegu pojawi się wkrótce.</p>
          )}
        </div>

        <div className="mt-6">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">
            {specialists.length > 1 ? "Kto wykonuje ten zabieg" : "Kto wykonuje ten zabieg"}
          </div>
          {specialists.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-200 bg-white p-5 text-center text-sm text-zinc-500">
              Brak przypisanych specjalistów.
            </div>
          ) : (
            <div className="space-y-3">
              {specialists.map((s) => (
                <Link
                  key={s.id}
                  href={`/panel-klienta/specjalisci/${s.id}`}
                  className="flex items-center gap-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-emerald-300 hover:shadow"
                >
                  <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full bg-zinc-100">
                    {s.avatarUrl ? (
                      <Image src={s.avatarUrl} alt={s.name} fill className="object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-zinc-400">
                        <UserIcon className="h-6 w-6" />
                      </span>
                    )}
                  </span>
                  <div className="min-w-0">
                    <div className="font-medium text-zinc-900">{s.name}</div>
                    <div className="truncate text-xs text-zinc-500">{s.jobTitle || s.specialization || ""}</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
