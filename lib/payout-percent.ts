import { prisma } from "@/lib/db";

// Procent specjalisty od zabiegu: ogólny procent pracownika (User.payoutPercent), a dla zabiegów
// z wyjątkiem (SpecialistServicePercent) — procent wyjątku. Wyjątek zawsze nadpisuje ogólny.

export type PercentOverrides = Map<string, number>; // serviceId → procent

export function effectivePercent(
  generalPercent: number | null | undefined,
  overrides: PercentOverrides | undefined,
  serviceId: string | null | undefined,
): number {
  if (serviceId && overrides?.has(serviceId)) return overrides.get(serviceId)!;
  return generalPercent ?? 0;
}

/** Wyjątki procentowe wielu specjalistów naraz: specialistId → (serviceId → procent). */
export async function loadPercentOverrides(specialistIds: string[]): Promise<Map<string, PercentOverrides>> {
  const result = new Map<string, PercentOverrides>();
  if (specialistIds.length === 0) return result;
  const rows = await prisma.specialistServicePercent.findMany({
    where: { specialistId: { in: specialistIds } },
    select: { specialistId: true, serviceId: true, percent: true },
  });
  for (const row of rows) {
    const map = result.get(row.specialistId) ?? new Map<string, number>();
    map.set(row.serviceId, row.percent);
    result.set(row.specialistId, map);
  }
  return result;
}
