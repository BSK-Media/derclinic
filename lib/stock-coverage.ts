// Czy zapas produktu wystarczy na zaplanowane wizyty. Czysta logika — dane z bazy dostarcza stock-coverage-db.ts.

export type CoverageVisit = { startsAt: Date; serviceId: string | null; serviceName: string | null };
export type CoverageSuggestion = { productId: string; quantity: number };

export type ProductCoverage = {
  /** Ile produktu zejdzie na zaplanowane wizyty w horyzoncie. */
  demand: number;
  /** Stan minus zapotrzebowanie (ujemny = zabraknie). */
  balance: number;
  /** Liczba zaplanowanych wizyt zużywających ten produkt. */
  visits: number;
  /** Pierwsza wizyta, na którą produktu już nie wystarczy (kolejność chronologiczna). */
  shortageAt: Date | null;
  shortageService: string | null;
};

/**
 * Zapotrzebowanie liczymy z sugerowanych produktów przy usługach (ilość na zabieg). Wizyty układamy chronologicznie
 * i odejmujemy od aktualnego stanu, żeby wskazać wizytę, od której produktu zabraknie.
 */
export function computeStockCoverage(
  visits: CoverageVisit[],
  suggestionsByService: Map<string, CoverageSuggestion[]>,
  stockByProduct: Map<string, number>,
): Map<string, ProductCoverage> {
  const result = new Map<string, ProductCoverage>();
  const left = new Map<string, number>();
  const sorted = [...visits].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  for (const visit of sorted) {
    if (!visit.serviceId) continue;
    for (const suggestion of suggestionsByService.get(visit.serviceId) ?? []) {
      if (!(suggestion.quantity > 0)) continue;
      const stock = stockByProduct.get(suggestion.productId) ?? 0;
      const entry =
        result.get(suggestion.productId) ??
        { demand: 0, balance: stock, visits: 0, shortageAt: null, shortageService: null };
      const remaining = (left.get(suggestion.productId) ?? stock) - suggestion.quantity;
      left.set(suggestion.productId, remaining);
      entry.demand += suggestion.quantity;
      entry.visits += 1;
      entry.balance = remaining;
      if (remaining < 0 && !entry.shortageAt) {
        entry.shortageAt = visit.startsAt;
        entry.shortageService = visit.serviceName;
      }
      result.set(suggestion.productId, entry);
    }
  }
  return result;
}
