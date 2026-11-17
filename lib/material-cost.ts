/**
 * Cena jednostkowa materiału w rozliczeniach ze specjalistami: klinika kupuje produkt za cenę zakupu, a specjaliście
 * go „sprzedaje” po cenie sprzedaży (zakup + marża), więc rozliczenie liczy się od ceny sprzedaży.
 * Gdy produkt nie ma ceny sprzedaży, używamy ceny zakupu (zamiast liczyć materiał jako darmowy).
 */
export function settlementUnitPrice(product: { salePrice?: number | null; purchasePrice?: number | null }): number {
  return product.salePrice ?? product.purchasePrice ?? 0;
}

/** Koszt materiału w rozliczeniu specjalisty (grosze): zużyta ilość × cena sprzedaży produktu. */
export function settlementMaterialCost(product: { salePrice?: number | null; purchasePrice?: number | null }, quantity: number): number {
  return Math.round(settlementUnitPrice(product) * Math.abs(quantity));
}
