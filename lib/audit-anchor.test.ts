import { describe, expect, it } from "vitest";
import { buildMonthlyDigest, detectAnomalies, monthRange, previousMonth, type DailyAnchor } from "./audit-anchor";

const anchor = (day: string, totalCount: number, extra: Partial<DailyAnchor> = {}): DailyAnchor => ({
  at: `${day}T03:30:00.000Z`,
  totalCount,
  totalHash: "a".repeat(64),
  last24hCount: 10,
  last24hHash: "b".repeat(64),
  checked: 10,
  valid: 10,
  invalid: 0,
  unsigned: 0,
  ...extra,
});

describe("zakres miesiąca", () => {
  it("poprzedni miesiąc względem 1 listopada to październik", () => {
    const { key, start, end } = previousMonth(new Date("2026-11-01T03:30:00Z"));
    expect(key).toBe("2026-10");
    expect(start.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });
  it("styczeń → grudzień poprzedniego roku", () => {
    expect(previousMonth(new Date("2027-01-01T03:30:00Z")).key).toBe("2026-12");
  });
  it("monthRange z klucza", () => {
    expect(monthRange("2026-02").end.toISOString()).toBe("2026-03-01T00:00:00.000Z");
  });
});

describe("detectAnomalies", () => {
  it("brak anomalii przy rosnącej liczbie wpisów i poprawnych podpisach", () => {
    expect(detectAnomalies(anchor("2026-10-02", 1100), { totalCount: 1050 })).toEqual([]);
    expect(detectAnomalies(anchor("2026-10-02", 1050), { totalCount: 1050 })).toEqual([]);
  });
  it("spadek liczby wpisów i zmienione podpisy to anomalie", () => {
    expect(detectAnomalies(anchor("2026-10-02", 900), { totalCount: 1050 })).toHaveLength(1);
    expect(detectAnomalies(anchor("2026-10-02", 1100, { invalid: 2 }), { totalCount: 1050 })[0]).toMatch(/niepoprawny podpis/);
  });
  it("pierwsza kotwica (brak poprzedniej) nie jest anomalią", () => {
    expect(detectAnomalies(anchor("2026-10-02", 10), null)).toEqual([]);
  });
});

describe("buildMonthlyDigest", () => {
  it("pełny miesiąc bez nieprawidłowości", () => {
    const anchors = Array.from({ length: 31 }, (_, i) => anchor(`2026-10-${String(i + 1).padStart(2, "0")}`, 1000 + i));
    const digest = buildMonthlyDigest("2026-10", anchors);
    expect(digest.days).toBe(31);
    expect(digest.missingDays).toEqual([]);
    expect(digest.anomalies).toBe(0);
    expect(digest.text).toContain("Brak nieprawidłowości");
    expect(digest.text.split("\n").filter((line) => /^2026-10-\d\d · /.test(line))).toHaveLength(31);
    expect(digest.html).toContain("<table");
    expect(digest.subject).toContain("2026-10");
  });
  it("wykrywa brakujące dni, spadek liczby wpisów i zmienione podpisy", () => {
    const anchors = [
      anchor("2026-10-01", 1000),
      anchor("2026-10-02", 1010),
      anchor("2026-10-04", 900, { invalid: 3 }), // 3 października brak, spadek, zmienione podpisy
    ];
    const digest = buildMonthlyDigest("2026-10", anchors);
    expect(digest.days).toBe(3);
    expect(digest.missingDays).toContain("2026-10-03");
    expect(digest.missingDays).toHaveLength(28);
    expect(digest.anomalies).toBe(4); // 3 zmienione + 1 spadek
    expect(digest.text).toContain("UWAGA");
    expect(digest.text).toContain("(SPADEK)");
  });
  it("miesiąc bez żadnej kotwicy wskazuje na awarię zadania", () => {
    const digest = buildMonthlyDigest("2026-09", []);
    expect(digest.days).toBe(0);
    expect(digest.missingDays).toHaveLength(30);
    expect(digest.text).toContain("nie zapisano żadnej kotwicy");
  });
});
