import { describe, expect, it } from "vitest";
import { purchaseConsumptionCost, saleConsumptionValue, settlementConsumptionCost } from "./material-cost";

const product = { salePrice: 300, purchasePrice: 200 };

describe("koszt materiału z historią cen", () => {
  it("rozliczenie specjalisty liczy od ceny sprzedaży zapisanej przy zużyciu, nie od bieżącej z katalogu", () => {
    const consumption = { quantity: "2", salePriceAtUse: 150, purchasePriceAtUse: 100, product };
    expect(settlementConsumptionCost(consumption)).toBe(300);
    expect(purchaseConsumptionCost(consumption)).toBe(200);
    expect(saleConsumptionValue(consumption)).toBe(300);
  });

  it("zużycie bez zapisanych cen (sprzed historii) używa cen bieżących z katalogu", () => {
    const consumption = { quantity: 2, product };
    expect(settlementConsumptionCost(consumption)).toBe(600);
    expect(purchaseConsumptionCost(consumption)).toBe(400);
  });

  it("brak ceny sprzedaży: rozliczenie po cenie zakupu, nie za darmo", () => {
    expect(settlementConsumptionCost({ quantity: 1, salePriceAtUse: null, purchasePriceAtUse: 120, product })).toBe(120);
    expect(settlementConsumptionCost({ quantity: 1, product: { salePrice: null, purchasePrice: 80 } })).toBe(80);
  });

  it("ilość ujemna liczona jako wartość bezwzględna", () => {
    expect(settlementConsumptionCost({ quantity: "-3", salePriceAtUse: 10, product })).toBe(30);
  });
});
