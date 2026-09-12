import type { Prisma } from "@prisma/client";

// --- Zasady programu lojalnościowego DerClinic ---
// 1 punkt za każde wydane 10 zł (na podstawie ceny końcowej zaakceptowanej
// wizyty). 1 punkt = 1 zł rabatu przy kolejnej rezerwacji online.
// Te dwie stałe są JEDYNYM miejscem, z którego wynika cała reszta systemu —
// zmiana zasady programu (np. na 1 pkt / 5 zł) wymaga zmiany tylko tutaj.
export const GROSZE_PER_EARNED_POINT = 1000; // 10,00 zł
export const GROSZE_PER_REDEEMED_POINT = 100; // 1,00 zł

export function pointsEarnedForAmount(amountGrosze: number): number {
  if (!Number.isFinite(amountGrosze) || amountGrosze <= 0) return 0;
  return Math.floor(amountGrosze / GROSZE_PER_EARNED_POINT);
}

export function discountForPoints(points: number): number {
  if (!Number.isFinite(points) || points <= 0) return 0;
  return Math.round(points) * GROSZE_PER_REDEEMED_POINT;
}

/** Maksymalna liczba punktów, jaką można wykorzystać na rezerwację o danej cenie. */
export function maxRedeemablePoints(balancePoints: number, priceGrosze: number | null | undefined): number {
  const byBalance = Math.max(0, Math.floor(balancePoints || 0));
  if (!priceGrosze || priceGrosze <= 0) return 0;
  const byPrice = Math.floor(priceGrosze / GROSZE_PER_REDEEMED_POINT);
  return Math.min(byBalance, byPrice);
}

type TxClient = Prisma.TransactionClient;

/**
 * Nalicza punkty za wizytę — wywoływane w momencie, gdy recepcja/admin
 * ZAAKCEPTUJE zakończoną wizytę (nie samo oznaczenie jako "Zakończona" —
 * dopiero akceptacja potwierdza, że dane i cena są poprawne).
 * Idempotentne: jeśli `loyaltyPointsAwardedAt` jest już ustawione, nic nie
 * robi — więc bezpiecznie wywołać przy ponownej akceptacji.
 */
export async function awardLoyaltyPointsForAppointment(
  tx: TxClient,
  appointment: { id: string; patientId: string; priceFinal: number | null; loyaltyPointsAwardedAt: Date | null },
): Promise<number> {
  if (appointment.loyaltyPointsAwardedAt) return 0;

  const points = pointsEarnedForAmount(appointment.priceFinal ?? 0);

  if (points > 0) {
    await tx.patient.update({
      where: { id: appointment.patientId },
      data: { loyaltyPoints: { increment: points } },
    });
    await tx.loyaltyPointsTransaction.create({
      data: {
        patientId: appointment.patientId,
        appointmentId: appointment.id,
        type: "EARNED",
        points,
        note: `Naliczono za wizytę — cena końcowa ${((appointment.priceFinal ?? 0) / 100).toFixed(2)} zł (1 pkt / 10 zł)`,
      },
    });
  }

  // Znacznik ustawiamy zawsze (nawet przy 0 punktach), żeby ta sama wizyta
  // nigdy nie naliczyła punktów drugi raz.
  await tx.appointment.update({
    where: { id: appointment.id },
    data: { loyaltyPointsAwardedAt: new Date() },
  });

  return points;
}

/**
 * Wykorzystuje punkty jako rabat przy rezerwacji. Rzuca błąd, jeśli pacjent
 * nie ma wystarczającego salda — wołający powinien to złapać i zwrócić błąd
 * walidacji do klienta.
 */
export async function redeemLoyaltyPoints(
  tx: TxClient,
  params: { patientId: string; points: number; appointmentId: string },
): Promise<{ discountAmount: number }> {
  const points = Math.floor(params.points);
  if (points <= 0) return { discountAmount: 0 };

  const patient = await tx.patient.findUnique({
    where: { id: params.patientId },
    select: { loyaltyPoints: true },
  });
  if (!patient || patient.loyaltyPoints < points) {
    throw new Error("Niewystarczająca liczba punktów lojalnościowych.");
  }

  await tx.patient.update({
    where: { id: params.patientId },
    data: { loyaltyPoints: { decrement: points } },
  });

  const discountAmount = discountForPoints(points);

  await tx.loyaltyPointsTransaction.create({
    data: {
      patientId: params.patientId,
      appointmentId: params.appointmentId,
      type: "REDEEMED",
      points,
      note: `Wykorzystano jako rabat przy rezerwacji — ${(discountAmount / 100).toFixed(2)} zł (1 pkt = 1 zł)`,
    },
  });

  return { discountAmount };
}
