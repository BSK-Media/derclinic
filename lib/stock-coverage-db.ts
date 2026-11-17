import { prisma } from "@/lib/db";
import { computeStockCoverage, type CoverageSuggestion, type ProductCoverage } from "@/lib/stock-coverage";

export const COVERAGE_HORIZONS = [14, 30, 60, 90] as const;
export const DEFAULT_COVERAGE_HORIZON = 30;

export function parseCoverageHorizon(value: string | null): number {
  const days = Number(value);
  return (COVERAGE_HORIZONS as readonly number[]).includes(days) ? days : DEFAULT_COVERAGE_HORIZON;
}

export type ProductCoverageDto = {
  demand: number;
  balance: number;
  visits: number;
  shortageAt: string | null;
  shortageService: string | null;
};

/**
 * Pokrycie zaplanowanych wizyt materiałami: dla każdego produktu zapotrzebowanie z wizyt w najbliższych `horizonDays`
 * dniach (sugerowane produkty przy usługach) względem łącznego stanu produktu.
 */
export async function loadStockCoverage(options: {
  horizonDays: number;
  locationScopeId?: string | null;
  stockByProduct: Map<string, number>;
}): Promise<Map<string, ProductCoverageDto>> {
  const now = new Date();
  const until = new Date(now.getTime() + options.horizonDays * 24 * 60 * 60 * 1000);

  const visits = await prisma.appointment.findMany({
    where: {
      status: "SCHEDULED",
      deletedAt: null,
      startsAt: { gte: now, lte: until },
      ...(options.locationScopeId ? { locationId: options.locationScopeId } : {}),
    },
    select: { startsAt: true, serviceId: true, service: { select: { name: true } } },
    take: 20000,
  });
  if (visits.length === 0) return new Map();

  const serviceIds = Array.from(new Set(visits.map((visit) => visit.serviceId!)));
  const rows = await prisma.serviceSuggestedProduct.findMany({
    where: { serviceId: { in: serviceIds } },
    select: { serviceId: true, productId: true, quantity: true },
  });
  const suggestionsByService = new Map<string, CoverageSuggestion[]>();
  for (const row of rows) {
    const list = suggestionsByService.get(row.serviceId) ?? [];
    list.push({ productId: row.productId, quantity: Number(row.quantity) });
    suggestionsByService.set(row.serviceId, list);
  }

  const coverage = computeStockCoverage(
    visits.map((visit) => ({ startsAt: visit.startsAt, serviceId: visit.serviceId, serviceName: visit.service?.name ?? null })),
    suggestionsByService,
    options.stockByProduct,
  );

  return new Map(
    Array.from(coverage, ([productId, item]: [string, ProductCoverage]) => [
      productId,
      {
        demand: item.demand,
        balance: item.balance,
        visits: item.visits,
        shortageAt: item.shortageAt ? item.shortageAt.toISOString() : null,
        shortageService: item.shortageService,
      },
    ]),
  );
}
