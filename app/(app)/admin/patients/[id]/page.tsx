import { prisma } from "@/lib/db";
import { formatPLNFromGrosze } from "@/lib/money";
import { appointmentStatusLabel } from "@/lib/appointment-status";
import { PatientDetailsForm } from "@/components/patient-details-form";
import { PatientStatistics } from "@/components/patient-statistics";
import { getEffectiveAuth } from "@/lib/effective-auth";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

export default async function AdminPatientDetailPage({ params }: { params: { id: string } }) {
  const { user } = await getEffectiveAuth();
  const isAdmin = user?.role === "ADMIN";
  const patient = await prisma.patient.findUnique({ where: { id: params.id } });
  if (!patient) return <div className="p-6 text-sm">Nie znaleziono pacjenta.</div>;

  const appts = await prisma.appointment.findMany({
    where: { patientId: params.id, deletedAt: null },
    orderBy: { startsAt: "desc" },
    include: {
      specialist: true,
      service: true,
      payments: true,
      consumptions: { include: { product: true } },
    },
    take: 200,
  });

  return (
    <div className="space-y-6">
      <PatientDetailsForm
        patient={{
          id: patient.id,
          name: patient.name,
          phone: patient.phone,
          email: patient.email,
          note: patient.note,
        }}
      >
        <PatientStatistics patientId={patient.id} showSpending={isAdmin} />
      </PatientDetailsForm>

      <div className="rounded-xl border bg-white shadow-sm dark:bg-zinc-950">
        <div className="border-b p-4 font-medium">Historia wizyt</div>
        <div className="space-y-3 p-4 md:hidden">
          {appts.length === 0 ? (
            <div className="rounded-2xl border bg-white p-5 text-center text-sm text-zinc-500 dark:bg-[#0b1220]">
              Brak wizyt.
            </div>
          ) : null}

          {appts.map((a) => {
            const startsAt = new Date(a.startsAt);
            const paid = a.payments.reduce((sum, payment) => sum + payment.amount, 0);

            return (
              <div
                key={a.id}
                className="min-w-0 overflow-hidden rounded-2xl border bg-white p-4 shadow-sm dark:bg-[#0b1220]"
              >
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                      Zabieg
                    </div>
                    <div className="mt-1 break-words text-base font-semibold leading-6 text-zinc-950 dark:text-zinc-50">
                      {a.customServiceName || a.service.name}
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
                      href={`/admin/appointments/${a.id}`}
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
                    {a.specialist.name}
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between gap-3 border-t pt-3">
                  <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Status
                  </span>
                  <span className="text-right text-sm font-medium text-zinc-800 dark:text-zinc-100">
                    {appointmentStatusLabel(a.status)}
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
                      {formatPLNFromGrosze(a.priceFinal ?? a.priceEstimate)}
                    </div>
                  </div>
                  <div className="min-w-0 p-3 text-right">
                    <div className="text-xs text-zinc-500">Zapłacono</div>
                    <div className="mt-1 break-words font-semibold tabular-nums">
                      {paid ? formatPLNFromGrosze(paid) : "—"}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="hidden overflow-auto md:block">
          <table className="w-full text-sm">
            <thead className="text-left text-zinc-500">
              <tr>
                <th className="p-3">Data</th>
                <th className="p-3">Usługa</th>
                <th className="p-3">Specjalista</th>
                <th className="p-3">Status</th>
                <th className="p-3">Cena</th>
                <th className="p-3">Płatności</th>
              </tr>
            </thead>
            <tbody>
              {appts.length === 0 && (
                <tr>
                  <td className="p-3 text-zinc-500" colSpan={6}>
                    Brak wizyt.
                  </td>
                </tr>
              )}
              {appts.map((a) => {
                const paid = a.payments.reduce((s, p) => s + p.amount, 0);
                return (
                  <tr key={a.id} className="border-t">
                    <td className="p-3">
                      {new Date(a.startsAt).toLocaleString("pl-PL", {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="p-3">{a.customServiceName || a.service.name}</td>
                    <td className="p-3">{a.specialist.name}</td>
                    <td className="p-3">{appointmentStatusLabel(a.status)}</td>
                    <td className="p-3">{formatPLNFromGrosze(a.priceFinal ?? a.priceEstimate)}</td>
                    <td className="p-3">{paid ? formatPLNFromGrosze(paid) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
