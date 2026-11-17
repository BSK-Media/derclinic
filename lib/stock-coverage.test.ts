import { describe, expect, it } from "vitest";
import { computeStockCoverage } from "./stock-coverage";

const day = (n: number) => new Date(Date.UTC(2026, 9, n, 10));
const suggestions = new Map([
  ["botox", [{ productId: "p1", quantity: 50 }]],
  ["peel", [{ productId: "p2", quantity: 2 }, { productId: "p1", quantity: 10 }]],
]);

describe("pokrycie zaplanowanych wizyt", () => {
  it("liczy zapotrzebowanie i bilans", () => {
    const out = computeStockCoverage(
      [
        { startsAt: day(2), serviceId: "botox", serviceName: "Botoks" },
        { startsAt: day(5), serviceId: "botox", serviceName: "Botoks" },
      ],
      suggestions,
      new Map([["p1", 130]]),
    );
    expect(out.get("p1")).toMatchObject({ demand: 100, balance: 30, visits: 2, shortageAt: null });
  });

  it("wskazuje pierwszą wizytę, na którą zabraknie produktu (kolejność chronologiczna)", () => {
    const out = computeStockCoverage(
      [
        { startsAt: day(9), serviceId: "botox", serviceName: "Botoks" },
        { startsAt: day(3), serviceId: "botox", serviceName: "Botoks" },
        { startsAt: day(6), serviceId: "peel", serviceName: "Peeling" },
      ],
      suggestions,
      new Map([["p1", 100]]),
    );
    const p1 = out.get("p1")!;
    expect(p1.demand).toBe(110);
    expect(p1.balance).toBe(-10);
    expect(p1.shortageAt).toEqual(day(9));
    expect(p1.shortageService).toBe("Botoks");
  });

  it("produkt bez stanu i usługa bez produktów", () => {
    const out = computeStockCoverage(
      [
        { startsAt: day(2), serviceId: "peel", serviceName: "Peeling" },
        { startsAt: day(3), serviceId: "inna", serviceName: "Inna" },
        { startsAt: day(4), serviceId: null, serviceName: null },
      ],
      suggestions,
      new Map(),
    );
    expect(out.get("p2")).toMatchObject({ demand: 2, balance: -2, shortageAt: day(2) });
    expect(out.size).toBe(2);
  });
});
