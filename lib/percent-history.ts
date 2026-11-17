// Historia procentu specjalisty: procent obowiązujący w dniu wizyty (ogólny albo wyjątek od zabiegu).
// Zmiana procentu działa od momentu zmiany i nie przelicza poprzednich okresów (SpecialistPercentChange).
import { prisma } from "@/lib/db";

export type PercentChangeRow = {
  serviceId: string | null;
  percent: number | null;
  effectiveFrom: Date;
};

/** Oś czasu procentów jednego specjalisty. Gdy brak wpisów historii, obowiązują wartości bieżące (fallback). */
export class PercentTimeline {
  private general: PercentChangeRow[] = [];
  private byService = new Map<string, PercentChangeRow[]>();

  constructor(
    rows: PercentChangeRow[],
    private fallbackGeneral: number,
    private fallbackOverrides: Map<string, number> = new Map(),
  ) {
    const sorted = [...rows].sort((a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime());
    for (const row of sorted) {
      if (row.serviceId) {
        const list = this.byService.get(row.serviceId) ?? [];
        list.push(row);
        this.byService.set(row.serviceId, list);
      } else {
        this.general.push(row);
      }
    }
  }

  private static latest(rows: PercentChangeRow[] | undefined, at: Date): PercentChangeRow | null {
    let found: PercentChangeRow | null = null;
    for (const row of rows ?? []) {
      if (row.effectiveFrom.getTime() <= at.getTime()) found = row;
      else break;
    }
    return found;
  }

  /** Procent ogólny obowiązujący w danym momencie. */
  generalAt(at: Date): number {
    const row = PercentTimeline.latest(this.general, at);
    if (row && row.percent !== null) return row.percent;
    // Przed pierwszym wpisem historii (lub bez historii) — najstarszy znany procent albo bieżący.
    return this.general[0]?.percent ?? this.fallbackGeneral;
  }

  /** Procent za zabieg w danym momencie: wyjątek (jeśli obowiązywał), w przeciwnym razie ogólny. */
  at(serviceId: string | null | undefined, at: Date): number {
    if (serviceId) {
      const list = this.byService.get(serviceId);
      if (list) {
        const row = PercentTimeline.latest(list, at);
        if (row) return row.percent !== null ? row.percent : this.generalAt(at);
      } else if (this.general.length === 0 && this.fallbackOverrides.has(serviceId)) {
        return this.fallbackOverrides.get(serviceId)!;
      }
    }
    return this.generalAt(at);
  }
}

/** Osie czasu procentów wielu specjalistów naraz. */
export async function loadPercentTimelines(
  specialists: { id: string; payoutPercent: number | null }[],
  fallbackOverrides?: Map<string, Map<string, number>>,
): Promise<Map<string, PercentTimeline>> {
  const result = new Map<string, PercentTimeline>();
  if (specialists.length === 0) return result;
  const rows = await prisma.specialistPercentChange.findMany({
    where: { specialistId: { in: specialists.map((s) => s.id) } },
    select: { specialistId: true, serviceId: true, percent: true, effectiveFrom: true },
  });
  const bySpecialist = new Map<string, PercentChangeRow[]>();
  for (const row of rows) {
    const list = bySpecialist.get(row.specialistId) ?? [];
    list.push({ serviceId: row.serviceId, percent: row.percent, effectiveFrom: row.effectiveFrom });
    bySpecialist.set(row.specialistId, list);
  }
  for (const specialist of specialists) {
    result.set(
      specialist.id,
      new PercentTimeline(bySpecialist.get(specialist.id) ?? [], specialist.payoutPercent ?? 0, fallbackOverrides?.get(specialist.id)),
    );
  }
  return result;
}

/** Zapis zmiany procentu od teraz (ogólny: serviceId = null; wyjątek: serviceId, percent = null usuwa wyjątek). */
export async function recordPercentChange(input: {
  specialistId: string;
  serviceId?: string | null;
  percent: number | null;
  changedById?: string | null;
  effectiveFrom?: Date;
}) {
  await prisma.specialistPercentChange.create({
    data: {
      specialistId: input.specialistId,
      serviceId: input.serviceId ?? null,
      percent: input.percent,
      effectiveFrom: input.effectiveFrom ?? new Date(),
      changedById: input.changedById ?? null,
    },
  });
}
