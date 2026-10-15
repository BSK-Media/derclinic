import { prisma } from "@/lib/db";
import { computeRfm, type RfmResult } from "@/lib/rfm";
import { getRfmSettings } from "@/lib/rfm-settings";

// Wspólne źródło danych RFM (Analityka, karta pacjenta, listy newslettera). Liczone są zakończone,
// zaakceptowane i nieusunięte wizyty oraz sprzedaż detaliczna przypisana do pacjenta — te same
// kryteria co w statystykach pacjenta. Ustawienia (okno, progi) pochodzą z Ustawień → Segmentacja RFM.
export async function loadRfm(locationId: string | null, now: Date = new Date()) {
  const settings = await getRfmSettings();
  const windowStart = new Date(now.getTime() - settings.windowDays * 24 * 3600 * 1000);
  const scope = locationId ? { locationId } : {};

  const [appointments, sales] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        status: "COMPLETED",
        approvalStatus: "APPROVED",
        deletedAt: null,
        service: { name: { not: "__DERCLINIC_REZERWACJA_CZASU__" } },
        patient: { ...scope },
        ...scope,
      },
      select: { patientId: true, startsAt: true, priceFinal: true, priceEstimate: true },
      take: 100000,
    }),
    prisma.retailSale.findMany({
      where: { status: "COMPLETED", patientId: { not: null }, ...scope },
      select: { patientId: true, createdAt: true, total: true },
      take: 100000,
    }),
  ]);

  const agg = new Map<string, { lastAt: Date; frequency: number; monetary: number }>();
  const add = (id: string, at: Date, amount: number) => {
    const cur = agg.get(id) ?? { lastAt: at, frequency: 0, monetary: 0 };
    if (at > cur.lastAt) cur.lastAt = at;
    if (at >= windowStart) {
      cur.frequency += 1;
      cur.monetary += amount;
    }
    agg.set(id, cur);
  };
  for (const a of appointments) add(a.patientId, a.startsAt, a.priceFinal ?? a.priceEstimate ?? 0);
  for (const s of sales) if (s.patientId) add(s.patientId, s.createdAt, s.total);

  const scored: RfmResult[] = computeRfm(
    [...agg.entries()].map(([id, v]) => ({ patientId: id, ...v })),
    now,
    { thresholds: settings.thresholds },
  );
  return { settings, scored };
}
