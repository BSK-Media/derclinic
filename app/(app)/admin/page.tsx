import { prisma } from "@/lib/db";
import { formatPLNFromGrosze } from "@/lib/money";

export default async function AdminDashboard() {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0,0,0,0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const [todayAppointments, products, patients, specialists] = await Promise.all([
    prisma.appointment.count({ where: { startsAt: { gte: start, lt: end } } }),
    prisma.product.count(),
    prisma.patient.count(),
    prisma.user.count({ where: { role: "SPECIALIST" } }),
  ]);

  const todayRevenue = await prisma.appointment.aggregate({
    where: { status: "COMPLETED", startsAt: { gte: start, lt: end }, priceFinal: { not: null } },
    _sum: { priceFinal: true },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Panel administracyjny</h1>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-xl border bg-white p-4 shadow-sm dark:bg-zinc-950">
          <div className="text-sm text-zinc-500">Wizyty dziś</div>
          <div className="text-2xl font-semibold">{todayAppointments}</div>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm dark:bg-zinc-950">
          <div className="text-sm text-zinc-500">Przychód dziś (zrealizowane)</div>
          <div className="text-2xl font-semibold">{formatPLNFromGrosze(todayRevenue._sum.priceFinal ?? 0)}</div>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm dark:bg-zinc-950">
          <div className="text-sm text-zinc-500">Pacjenci</div>
          <div className="text-2xl font-semibold">{patients}</div>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm dark:bg-zinc-950">
          <div className="text-sm text-zinc-500">Specjaliści</div>
          <div className="text-2xl font-semibold">{specialists}</div>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm dark:bg-zinc-950">
        <div className="font-medium">Szybki start</div>
        <ul className="mt-2 list-disc pl-5 text-sm text-zinc-600 dark:text-zinc-300 space-y-1">
          <li>Dodaj produkty i magazyny, aby kontrolować stany i koszty.</li>
          <li>Dodaj usługi i przypisz sugerowane preparaty (warianty A/B/C).</li>
          <li>Twórz wizyty (pacjent → specjalista → usługa → termin), a po zabiegu wpisuj cenę końcową i zużycia.</li>
          <li>W rozliczeniach lekarzy system policzy: przychód, koszt materiałów i kwotę do wypłaty.</li>
        </ul>
      </div>
    </div>
  );
}
