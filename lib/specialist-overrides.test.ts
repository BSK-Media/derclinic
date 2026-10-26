import { describe, expect, it } from "vitest";
import { applyMonthOverrides, isMonthKey, monthsCoveredBy, warsawMonthRange } from "./specialist-overrides";

describe("miesiące warszawskie", () => {
  it("październik zaczyna się o północy czasu letniego, a listopad zimowego", () => {
    const oct = warsawMonthRange("2026-10");
    expect(oct.start.toISOString()).toBe("2026-09-30T22:00:00.000Z");
    expect(oct.end.toISOString()).toBe("2026-10-31T23:00:00.000Z");
  });
  it("rozpoznaje poprawny klucz miesiąca", () => {
    expect(isMonthKey("2026-10")).toBe(true);
    expect(isMonthKey("2026-13")).toBe(false);
    expect(isMonthKey("26-10")).toBe(false);
  });
});

describe("miesiące objęte zakresem", () => {
  it("cały październik obejmuje październik, ale nie sąsiednie miesiące", () => {
    const { start, end } = warsawMonthRange("2026-10");
    expect(monthsCoveredBy(start, end)).toEqual(["2026-10"]);
  });
  it("zakres z trzech miesięcy obejmuje pełne miesiące w środku", () => {
    const a = warsawMonthRange("2026-09").start;
    const b = warsawMonthRange("2026-11").end;
    expect(monthsCoveredBy(a, b)).toEqual(["2026-09", "2026-10", "2026-11"]);
  });
  it("zakres częściowy (15 dni) nie obejmuje żadnego miesiąca", () => {
    expect(monthsCoveredBy(new Date("2026-10-05T00:00:00Z"), new Date("2026-10-20T00:00:00Z"))).toEqual([]);
  });
});

describe("nadpisanie miesiąca", () => {
  const items = [
    { startsAt: new Date("2026-10-05T10:00:00Z"), revenue: 100000, materialCost: 20000, payout: 40000 },
    { startsAt: new Date("2026-10-20T10:00:00Z"), revenue: 50000, materialCost: 10000, payout: 20000 },
    { startsAt: new Date("2026-09-10T10:00:00Z"), revenue: 30000, materialCost: 5000, payout: 12000 },
  ];
  it("bez nadpisań zwraca sumy z wizyt", () => {
    const r = applyMonthOverrides(items, []);
    expect(r).toMatchObject({ count: 3, revenue: 180000, materialCost: 35000, payout: 72000, overriddenMonths: [] });
  });
  it("wpisane wartości zastępują miesiąc, puste zostają standardowe, inne miesiące bez zmian", () => {
    const r = applyMonthOverrides(items, [
      { month: "2026-10", appointments: 12, revenue: 500000, materialCost: null, payout: 150000, note: null },
    ]);
    // wrzesień (30000) + październik wpisany (500000)
    expect(r.revenue).toBe(530000);
    expect(r.count).toBe(1 + 12);
    // koszt materiałów październik standardowy (30000) + wrzesień (5000)
    expect(r.materialCost).toBe(35000);
    expect(r.payout).toBe(12000 + 150000);
    expect(r.overriddenMonths).toEqual(["2026-10"]);
  });
});
