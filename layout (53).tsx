import { prisma } from "@/lib/db";
import { getAuthUser } from "@/lib/auth-cookie";
import { formatPLNFromGrosze } from "@/lib/money";
import Link from "next/link";

export default async function SpecialistHome() {
  const auth = await getAuthUser();
  if (!auth) return null;

  const now = new Date();
  const start = new Date(now); start.setHours(0,0,0,0);
  const end = new Date(start); end.setDate(end.getDate()+1);

  const todays = await prisma.appointment.findMany({
    where: { specialistId: auth.id, startsAt: { gte: start, lt: end } },
    orderBy: { startsAt: "asc" },
    include: { patient: true, service: true },
  });

  const completedRevenue = await prisma.appointment.aggregate({
    where: { specialistId: auth.id, status: "COMPLETED", startsAt: { gte: start, lt: end }, priceFinal: { not: null } },
    _sum: { priceFinal: true },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Mój dzień</h1>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border bg-white p-4 shadow-sm dark:bg-zinc-950">
          <div className="text-sm text-zinc-500">Wizyty dziś</div>
          <div className="text-2xl font-semibold">{todays.length}</div>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm dark:bg-zinc-950">
          <div className="text-sm text-zinc-500">Przychód dziś (zrealizowane)</div>
          <div className="text-2xl font-semibold">{formatPLNFromGrosze(completedRevenue._sum.priceFinal ?? 0)}</div>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm dark:bg-zinc-950">
          <div className="text-sm text-zinc-500">Mój % rozliczenia</div>
          <div className="text-2xl font-semibold">{auth.role === "ADMIN" ? "—" : ""}{/* fetched in /api/me for client */}</div>
          <div className="text-xs text-zinc-500">Ustawiane przez admina w profilu użytkownika.</div>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm dark:bg-zinc-950">
        <div className="flex items-center justify-between">
          <div className="font-medium">Wizyty na dziś</div>
          <Link className="text-sm underline" href="/specialist/appointments">Zobacz wszystkie</Link>
        </div>
        <div className="mt-3 divide-y">
          {todays.length === 0 && <div className="text-sm text-zinc-500 py-6">Brak wizyt.</div>}
          {todays.map((a) => (
            <div key={a.id} className="py-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium">{new Date(a.startsAt).toLocaleTimeString("pl-PL",{hour:"2-digit",minute:"2-digit"})} • {a.patient.name}</div>
                <div className="text-xs text-zinc-500">{a.service.name} • status: {a.status}</div>
              </div>
              <Link className="text-sm underline" href={`/specialist/appointments/${a.id}`}>Otwórz</Link>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
