import { prisma } from "@/lib/db";

// Statystyki pacjentów liczone z CAŁEJ historii (od zawsze), a nie z wycinka listy:
//  * completedVisits — zakończone, zaakceptowane i nieusunięte wizyty,
//  * totalSpent      — cena tych wizyt (cena końcowa, a w jej braku orientacyjna) + sprzedaż detaliczna
//                      przypisana do pacjenta (tylko gdy withSpending),
//  * lastVisitAt     — ostatnia (minęła) wizyta niezależnie od statusu, bez usuniętych.
// Te same kryteria co statystyki na karcie pacjenta (app/api/admin/patients/[id]/stats).

export type PatientStats = { completedVisits: number; totalSpent: number; lastVisitAt: Date | null };

export async function loadPatientStats(
  scope: { locationId?: string },
  options: { withSpending: boolean },
  now: Date = new Date(),
): Promise<Map<string, PatientStats>> {
  const [completed, lastVisits, sales] = await Promise.all([
    prisma.appointment.findMany({
      where: { status: "COMPLETED", approvalStatus: "APPROVED", deletedAt: null, ...scope },
      select: { patientId: true, priceFinal: true, priceEstimate: true },
      take: 200000,
    }),
    prisma.appointment.groupBy({
      by: ["patientId"],
      where: { deletedAt: null, startsAt: { lte: now }, ...scope },
      _max: { startsAt: true },
    }),
    options.withSpending
      ? prisma.retailSale.findMany({
          where: { status: "COMPLETED", patientId: { not: null }, ...scope },
          select: { patientId: true, total: true },
          take: 200000,
        })
      : Promise.resolve([] as { patientId: string | null; total: number }[]),
  ]);

  const stats = new Map<string, PatientStats>();
  const get = (id: string) => {
    let entry = stats.get(id);
    if (!entry) {
      entry = { completedVisits: 0, totalSpent: 0, lastVisitAt: null };
      stats.set(id, entry);
    }
    return entry;
  };

  for (const a of completed) {
    const entry = get(a.patientId);
    entry.completedVisits += 1;
    if (options.withSpending) entry.totalSpent += a.priceFinal ?? a.priceEstimate ?? 0;
  }
  for (const sale of sales) {
    if (sale.patientId) get(sale.patientId).totalSpent += sale.total;
  }
  for (const row of lastVisits) {
    get(row.patientId).lastVisitAt = row._max.startsAt ?? null;
  }
  return stats;
}
