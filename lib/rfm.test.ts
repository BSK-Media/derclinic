import { describe, expect, it } from "vitest";
import { classifyRfm, computeRfm } from "./rfm";

const now = new Date("2026-10-15T12:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 3600 * 1000);

describe("classifyRfm", () => {
  it("5-5-5 to VIP", () => expect(classifyRfm(5, 5, 5)).toBe("VIP"));
  it("1-5-5 to pacjent do odzyskania", () => expect(classifyRfm(1, 5, 5)).toBe("WIN_BACK"));
  it("niska świeżość i mała aktywność to uśpieni", () => expect(classifyRfm(1, 1, 2)).toBe("DORMANT"));
  it("świeży i rzadki to nowy", () => expect(classifyRfm(5, 1, 1)).toBe("NEW"));
});

describe("computeRfm", () => {
  it("zwraca pustą listę dla braku danych", () => expect(computeRfm([], now)).toEqual([]));

  it("ocenia najlepszego pacjenta na 5-5-5, a najgorszego na 1-1-1", () => {
    const inputs = Array.from({ length: 10 }, (_, i) => ({
      patientId: `p${i}`,
      lastAt: daysAgo(300 - i * 30),
      frequency: i + 1,
      monetary: (i + 1) * 10000,
    }));
    const res = computeRfm(inputs, now);
    const best = res.find((r) => r.patientId === "p9")!;
    const worst = res.find((r) => r.patientId === "p0")!;
    expect([best.r, best.f, best.m]).toEqual([5, 5, 5]);
    expect(best.segment).toBe("VIP");
    expect([worst.r, worst.f, worst.m]).toEqual([1, 1, 1]);
  });

  it("dawny duży pacjent trafia do odzyskania", () => {
    const inputs = [
      { patientId: "old", lastAt: daysAgo(340), frequency: 20, monetary: 900000 },
      ...Array.from({ length: 9 }, (_, i) => ({
        patientId: `p${i}`,
        lastAt: daysAgo(10 + i),
        frequency: 1 + (i % 3),
        monetary: 10000 + i * 1000,
      })),
    ];
    const res = computeRfm(inputs, now);
    expect(res.find((r) => r.patientId === "old")!.segment).toBe("WIN_BACK");
  });

  it("liczy dni od ostatniej wizyty", () => {
    const res = computeRfm([{ patientId: "a", lastAt: daysAgo(42), frequency: 1, monetary: 100 }], now);
    expect(res[0].daysSince).toBe(42);
  });
});
