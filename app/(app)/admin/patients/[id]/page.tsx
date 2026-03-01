import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatPLNFromGrosze } from "@/lib/money";

export default async function AdminPatientDetailPage({ params }: { params: { id: string } }) {
  const patient = await prisma.patient.findUnique({ where: { id: params.id } });
  if (!patient) return <div className="p-6 text-sm">Nie znaleziono pacjenta.</div>;

  const appts = await prisma.appointment.findMany({
    where: { patientId: params.id },
    orderBy: { startsAt: "desc" },
    include: { specialist: true, service: true, payments: true, consumptions: { include: { product: true } } },
    take: 200,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{patient.name}</h1>
          <div className="text-sm text-zinc-500">
            {patient.phone ? `tel: ${patient.phone}` : ""}{patient.phone && patient.email ? " • " : ""}{patient.email ?? ""}
          </div>
        </div>
        <Link className="underline" href="/admin/patients">Wróć</Link>
      </div>

      {patient.note && (
        <div className="rounded-xl border bg-white p-4 shadow-sm dark:bg-zinc-950">
          <div className="font-medium">Notatka</div>
          <div className="mt-2 text-sm text-zinc-700 dark:text-zinc-200 whitespace-pre-wrap">{patient.note}</div>
        </div>
      )}

      <div className="rounded-xl border bg-white shadow-sm dark:bg-zinc-950">
        <div className="p-4 border-b font-medium">Historia wizyt</div>
        <div className="overflow-auto">
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
                <tr><td className="p-3 text-zinc-500" colSpan={6}>Brak wizyt.</td></tr>
              )}
              {appts.map((a) => {
                const paid = a.payments.reduce((s, p) => s + p.amount, 0);
                return (
                  <tr key={a.id} className="border-t">
                    <td className="p-3">{new Date(a.startsAt).toLocaleString("pl-PL", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                    <td className="p-3">{a.service.name}</td>
                    <td className="p-3">{a.specialist.name}</td>
                    <td className="p-3">{a.status}</td>
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
