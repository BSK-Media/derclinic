import { prisma } from "@/lib/db";

// Wizyty jednego pacjenta w tym samym dniu (czas warszawski) — do wspólnego rozliczenia przy recepcji.

const WARSAW_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw" });
export const warsawDayKey = (date: Date) => WARSAW_DAY.format(date);

/** Należność za wizytę — ta sama kolejność pól co przy zapisie płatności i na karcie wizyty. */
export function appointmentDue(a: {
  priceFinal: number | null;
  priceEstimate: number | null;
  service: { price: number | null } | null;
}) {
  return a.priceFinal ?? a.service?.price ?? a.priceEstimate ?? 0;
}

export const GROUP_STATUSES = ["SCHEDULED", "COMPLETED"] as const;

/** Wizyty pacjenta z tego samego dnia co wskazana wizyta (bez odwołanych, nieobecności i usuniętych). */
export async function loadDayGroup(appointmentId: string, scope: { locationId?: string }) {
  const base = await prisma.appointment.findFirst({
    where: { id: appointmentId, deletedAt: null, ...scope },
    select: { id: true, patientId: true, startsAt: true },
  });
  if (!base) return null;

  const dayStart = new Date(base.startsAt.getTime() - 36 * 3600 * 1000);
  const dayEnd = new Date(base.startsAt.getTime() + 36 * 3600 * 1000);
  const candidates = await prisma.appointment.findMany({
    where: {
      patientId: base.patientId,
      deletedAt: null,
      status: { in: [...GROUP_STATUSES] },
      startsAt: { gte: dayStart, lte: dayEnd },
      ...scope,
    },
    orderBy: { startsAt: "asc" },
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      status: true,
      approvalStatus: true,
      priceFinal: true,
      priceEstimate: true,
      customServiceName: true,
      service: { select: { name: true, price: true } },
      specialist: { select: { name: true } },
      payments: { select: { amount: true, method: true } },
    },
  });
  const day = warsawDayKey(base.startsAt);
  return candidates.filter((a) => warsawDayKey(a.startsAt) === day);
}
