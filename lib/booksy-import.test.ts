import { describe, expect, it } from "vitest";
import {
  buildServiceMatcher,
  cleanText,
  mapStatus,
  normalizeEmail,
  normalizePhone,
  parseCsv,
  toGrosze,
  warsawLocalToDate,
} from "./booksy-import";

describe("parseCsv", () => {
  it("obsługuje cudzysłowy, przecinki i nowe linie w polach", () => {
    const rows = parseCsv('"a","b"\n"x, y","linia 1\nlinia 2"\n"z","""cyt"""\n');
    expect(rows).toEqual([
      { a: "x, y", b: "linia 1\nlinia 2" },
      { a: "z", b: '"cyt"' },
    ]);
  });
});

describe("normalizacja pól", () => {
  it("zamienia znaczniki pustych wartości na null", () => {
    expect(cleanText("None")).toBeNull();
    expect(cleanText(" null ")).toBeNull();
    expect(cleanText("Jan")).toBe("Jan");
  });
  it("normalizuje telefony do formatu aplikacji", () => {
    expect(normalizePhone("+48 507616542")).toBe("+48507616542");
    expect(normalizePhone("507 616 542")).toBe("+48507616542");
    expect(normalizePhone("+44 7901931764")).toBe("+447901931764");
    expect(normalizePhone("None")).toBeNull();
    expect(normalizePhone("123")).toBeNull();
  });
  it("odrzuca niepoprawne e-maile", () => {
    expect(normalizeEmail("None")).toBeNull();
    expect(normalizeEmail("Ada@Example.com")).toBe("ada@example.com");
    expect(normalizeEmail("bez-malpy")).toBeNull();
  });
  it("przelicza kwoty na grosze", () => {
    expect(toGrosze("500.0")).toBe(50000);
    expect(toGrosze("169,92")).toBe(16992);
    expect(toGrosze("null")).toBeNull();
  });
});

describe("daty", () => {
  it("zamienia czas warszawski na UTC (zima i lato)", () => {
    expect(warsawLocalToDate("2025-01-15 10:00:00")?.toISOString()).toBe("2025-01-15T09:00:00.000Z");
    expect(warsawLocalToDate("2025-07-15 10:00:00")?.toISOString()).toBe("2025-07-15T08:00:00.000Z");
  });
  it("zwraca null dla złej daty", () => {
    expect(warsawLocalToDate("")).toBeNull();
  });
});

describe("statusy", () => {
  const past = new Date("2024-01-01T10:00:00Z");
  const future = new Date("2999-01-01T10:00:00Z");
  it("mapuje statusy Booksy", () => {
    expect(mapStatus("Finished", past)).toEqual({ status: "COMPLETED", approved: true });
    expect(mapStatus("Cancelled", past).status).toBe("CANCELED");
    expect(mapStatus("Declined", past).status).toBe("CANCELED");
    expect(mapStatus("No-show", past).status).toBe("NO_SHOW");
  });
  it("potwierdzona przyszła wizyta jest zaplanowana, a zaległa nie", () => {
    expect(mapStatus("Confirmed", future).status).toBe("SCHEDULED");
    expect(mapStatus("Confirmed", past).status).toBe("CANCELED");
  });
});

describe("dopasowanie usług", () => {
  const services = [
    "Konsultacja dermatologiczna",
    "Toksyna botulinowa BOTOX - 3 okolice",
    "Toksyna botulinowa BOTOX - 1 okolica",
    "Icoone drenaż limfatyczny - 2 obszary",
    "Konsultacja z indywidualnie dobranym zabiegiem",
  ].map((name, i) => ({ id: `s${i}`, name }));
  const match = buildServiceMatcher(services);

  it("dopasowuje dokładnie ignorując wielkość liter i polskie znaki", () => {
    expect(match("konsultacja dermatologiczna")?.kind).toBe("exact");
  });
  it("liczba okolic z Booksy trafia na właściwy wariant", () => {
    expect(match("Botoks 3 okolice")?.serviceName).toBe("Toksyna botulinowa BOTOX - 3 okolice");
    expect(match("Botoks 1 okolica")?.serviceName).toBe("Toksyna botulinowa BOTOX - 1 okolica");
  });
  it("nieznana usługa trafia na usługę zastępczą, nie tworząc nowej", () => {
    const m = match("Laminacja rzęs z farbowaniem");
    expect(m?.kind).toBe("fallback");
    expect(m?.serviceName).toBe("Konsultacja z indywidualnie dobranym zabiegiem");
  });
});
