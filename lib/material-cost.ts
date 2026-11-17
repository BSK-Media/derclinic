type PricedProduct = { salePrice?: number | null; purchasePrice?: number | null };
type PricedConsumption = {
  quantity: unknown;
  salePriceAtUse?: number | null;
  purchasePriceAtUse?: number | null;
  product: PricedProduct;
};

function toNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Koszt materiału w rozliczeniu ze specjalistą (grosze): klinika kupuje produkt za cenę zakupu, a specjaliście
 * go „sprzedaje” po cenie sprzedaży (zakup + marża), więc rozliczenie liczy się od ceny sprzedaży.
 * Używamy ceny zapisanej przy zużyciu (`salePriceAtUse`), żeby późniejsza zmiana ceny w katalogu nie zmieniała
 * historii; gdy jej brak — ceny bieżącej z katalogu, a gdy produkt nie ma ceny sprzedaży — ceny zakupu.
 */
export function settlementConsumptionCost(consumption: PricedConsumption): number {
  // Zapisane ceny (choć jedna) = zużycie ma historię cen; wtedy katalog nie jest brany pod uwagę.
  const hasSnapshot = consumption.salePriceAtUse != null || consumption.purchasePriceAtUse != null;
  const unit = hasSnapshot
    ? (consumption.salePriceAtUse ?? consumption.purchasePriceAtUse ?? 0)
    : (consumption.product.salePrice ?? consumption.product.purchasePrice ?? 0);
  return Math.round(unit * Math.abs(toNumber(consumption.quantity)));
}

/** Rzeczywisty koszt zakupu zużytego materiału dla kliniki (grosze): cena zakupu z chwili zużycia, a w razie braku bieżąca. */
export function purchaseConsumptionCost(consumption: PricedConsumption): number {
  const hasSnapshot = consumption.salePriceAtUse != null || consumption.purchasePriceAtUse != null;
  const unit = hasSnapshot ? (consumption.purchasePriceAtUse ?? 0) : (consumption.product.purchasePrice ?? 0);
  return Math.round(unit * Math.abs(toNumber(consumption.quantity)));
}

/** Wartość zużytego materiału w cenie sprzedaży (grosze): cena sprzedaży z chwili zużycia, a w razie braku bieżąca. */
export function saleConsumptionValue(consumption: PricedConsumption): number {
  const hasSnapshot = consumption.salePriceAtUse != null || consumption.purchasePriceAtUse != null;
  const unit = hasSnapshot ? (consumption.salePriceAtUse ?? 0) : (consumption.product.salePrice ?? 0);
  return Math.round(unit * Math.abs(toNumber(consumption.quantity)));
}
