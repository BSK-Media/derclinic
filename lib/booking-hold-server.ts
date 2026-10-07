import { prisma } from "@/lib/prisma";

/**
 * Aktywne zatrzymania terminów (jeszcze nie zamienione w wizytę i nie wygasłe)
 * jako zajęte przedziały — dołączane do wizyt przy liczeniu wolnych terminów,
 * żeby dwie osoby nie płaciły za ten sam termin.
 */
export async function heldRanges(
  specialistIds: string[],
  from: Date,
  to: Date,
  options: { exceptHoldId?: string; now?: Date } = {},
) {
  if (specialistIds.length === 0) return [];
  const rows = await prisma.bookingHold.findMany({
    where: {
      specialistId: { in: specialistIds },
      appointmentId: null,
      expiresAt: { gt: options.now ?? new Date() },
      startsAt: { lte: to },
      endsAt: { gte: from },
      ...(options.exceptHoldId ? { id: { not: options.exceptHoldId } } : {}),
    },
    select: { specialistId: true, startsAt: true, endsAt: true },
  });
  return rows;
}

/** Sprzątanie: stare, niewykorzystane zatrzymania (wygasłe ponad dobę temu). */
export async function purgeExpiredHolds() {
  await prisma.bookingHold
    .deleteMany({ where: { appointmentId: null, expiresAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } } })
    .catch(() => {});
}
