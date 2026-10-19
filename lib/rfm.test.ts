import { describe, expect, it } from "vitest";
import {
  DEFAULT_RFM_RULES,
  DEFAULT_RFM_THRESHOLDS,
  classifyRfm,
  computeRfm,
  parseRfmRules,
  parseRfmThresholds,
  rfmScaleRows,
  type RfmRule,
} from "./rfm";

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

describe("własne progi", () => {
  const thresholds = { r: [30, 90, 180, 365], f: [2, 3, 5, 8], m: [300, 800, 2000, 5000] };
  it("ocenia wg progów, nie względem innych pacjentów", () => {
    const [a] = computeRfm([{ patientId: "a", lastAt: daysAgo(20), frequency: 9, monetary: 600000 }], now, { thresholds });
    expect([a.r, a.f, a.m]).toEqual([5, 5, 5]);
    const [b] = computeRfm([{ patientId: "b", lastAt: daysAgo(400), frequency: 1, monetary: 10000 }], now, { thresholds });
    expect([b.r, b.f, b.m]).toEqual([1, 1, 1]);
    const [c] = computeRfm([{ patientId: "c", lastAt: daysAgo(100), frequency: 3, monetary: 90000 }], now, { thresholds });
    expect([c.r, c.f, c.m]).toEqual([3, 3, 3]);
  });
  it("niepoprawne progi są odrzucane", () => {
    expect(parseRfmThresholds({ r: [5, 3, 2, 1], f: [1, 2, 3, 4], m: [1, 2, 3, 4] })).toBeNull();
    expect(parseRfmThresholds(thresholds)).toEqual(thresholds);
  });
});

describe("skala domyślna", () => {
  it("opisuje oceny 1–5 czytelnie", () => {
    const rows = rfmScaleRows(DEFAULT_RFM_THRESHOLDS);
    expect(rows.map((r) => r.score)).toEqual([5, 4, 3, 2, 1]);
    expect(rows[0].f).toBe("od 8 wizyt");
    expect(rows[4].r).toContain("powyżej");
  });
  it("dawny dobry pacjent (niedawno nieobecny, dużo wizyt i kwot) trafia do odzyskania", () => {
    const [p] = computeRfm([{ patientId: "x", lastAt: daysAgo(700), frequency: 9, monetary: 2000000 }], now, { thresholds: DEFAULT_RFM_THRESHOLDS });
    expect([p.r, p.f, p.m]).toEqual([2, 5, 5]);
    expect(p.segment).toBe("WIN_BACK");
  });
});

describe("reguły segmentów ustawiane przez administratora", () => {
  it("domyślne reguły dają te same segmenty co dawniej", () => {
    expect(classifyRfm(5, 5, 5, DEFAULT_RFM_RULES)).toBe("VIP");
    expect(classifyRfm(2, 1, 5, DEFAULT_RFM_RULES)).toBe("WIN_BACK");
    expect(classifyRfm(1, 3, 1, DEFAULT_RFM_RULES)).toBe("AT_RISK");
    expect(classifyRfm(4, 2, 3, DEFAULT_RFM_RULES)).toBe("NEW");
    expect(classifyRfm(3, 2, 2, DEFAULT_RFM_RULES)).toBe("OTHER");
  });
  it("własna reguła zmienia przydział, a pierwsza pasująca wygrywa", () => {
    const rules: RfmRule[] = [
      { segment: "DORMANT", r: [1, 3], f: [1, 5], m: [1, 5] },
      { segment: "VIP", r: [1, 5], f: [1, 5], m: [1, 5] },
    ];
    expect(classifyRfm(5, 5, 5, rules)).toBe("VIP");
    expect(classifyRfm(2, 5, 5, rules)).toBe("DORMANT");
    expect(classifyRfm(5, 5, 5, [])).toBe("OTHER");
  });
  it("computeRfm używa reguł z konfiguracji", () => {
    const rules: RfmRule[] = [{ segment: "LOYAL", r: [1, 5], f: [1, 5], m: [1, 5] }];
    const [p] = computeRfm([{ patientId: "a", lastAt: daysAgo(10), frequency: 1, monetary: 100 }], now, { rules });
    expect(p.segment).toBe("LOYAL");
  });
  it("odrzuca niepoprawne reguły", () => {
    expect(parseRfmRules([{ segment: "VIP", r: [4, 2], f: [1, 5], m: [1, 5] }])).toBeNull();
    expect(parseRfmRules([{ segment: "XYZ", r: [1, 5], f: [1, 5], m: [1, 5] }])).toBeNull();
    expect(parseRfmRules([{ segment: "VIP", r: [0, 5], f: [1, 5], m: [1, 5] }])).toBeNull();
    expect(parseRfmRules(DEFAULT_RFM_RULES)).toEqual(DEFAULT_RFM_RULES);
  });
});
