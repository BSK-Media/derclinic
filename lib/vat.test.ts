import { describe, expect, it } from "vitest";
import { allocateDiscount, normalizeNip, vatFromGross, vatSummary } from "./vat";

describe("vatFromGross", () => {
  it("wylicza VAT zawarty w cenie brutto", () => {
    expect(vatFromGross(12300, "VAT_23")).toBe(2300);
    expect(vatFromGross(10800, "VAT_8")).toBe(800);
    expect(vatFromGross(10000, "ZW")).toBe(0);
    expect(vatFromGross(10000, "VAT_0")).toBe(0);
  });
});

describe("allocateDiscount", () => {
  it("rozkłada zniżkę proporcjonalnie i co do grosza", () => {
    const result = allocateDiscount([10000, 5000, 3333], 1001);
    expect(result.reduce((a, b) => a + b, 0)).toBe(18333 - 1001);
    expect(result[0]).toBeLessThan(10000);
  });

  it("nie zmienia kwot bez zniżki i nie schodzi poniżej zera", () => {
    expect(allocateDiscount([100, 200], 0)).toEqual([100, 200]);
    expect(allocateDiscount([100, 200], 500)).toEqual([0, 0]);
  });
});

describe("vatSummary", () => {
  it("sumuje brutto per stawka i liczy VAT od sumy", () => {
    const rows = vatSummary([
      { gross: 12300, vatRate: "VAT_23" },
      { gross: 6150, vatRate: "VAT_23" },
      { gross: 10800, vatRate: "VAT_8" },
    ]);
    expect(rows).toEqual([
      { vatRate: "VAT_23", gross: 18450, vat: 3450, net: 15000 },
      { vatRate: "VAT_8", gross: 10800, vat: 800, net: 10000 },
    ]);
  });
});

describe("normalizeNip", () => {
  it("akceptuje poprawny NIP w różnych zapisach", () => {
    expect(normalizeNip("526-025-09-95")).toBe("5260250995");
    expect(normalizeNip("PL 5260250995")).toBe("5260250995");
  });

  it("odrzuca błędną cyfrę kontrolną i zły format", () => {
    expect(normalizeNip("5260250996")).toBeNull();
    expect(normalizeNip("123")).toBeNull();
  });
});
