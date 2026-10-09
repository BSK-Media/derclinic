import { beforeAll, describe, expect, it } from "vitest";
import { addBlindIndexes, blindIndex, rewritePatientWhere } from "./blind-index";
import { patientMatches } from "./patient-search";

beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-1234";
});

describe("blindIndex", () => {
  it("normalizuje e-mail (wielkość liter, spacje) i telefon (spacje, myślniki)", () => {
    expect(blindIndex("email", " Anna@Example.COM ")).toBe(blindIndex("email", "anna@example.com"));
    expect(blindIndex("phone", "+48 600-100-200")).toBe(blindIndex("phone", "+48600100200"));
  });
  it("puste wartości dają null, różne pola dają różne skróty", () => {
    expect(blindIndex("email", "")).toBeNull();
    expect(blindIndex("email", null)).toBeNull();
    expect(blindIndex("name", "x")).not.toBe(blindIndex("email", "x"));
  });
});

describe("addBlindIndexes", () => {
  it("dokłada skróty do danych zapisu, także dla { set }", () => {
    const out = addBlindIndexes({ name: "Anna", email: { set: "A@b.pl" }, phone: null, note: "x" }) as Record<string, unknown>;
    expect(out.nameHash).toBe(blindIndex("name", "Anna"));
    expect(out.emailHash).toBe(blindIndex("email", "a@b.pl"));
    expect(out.phoneHash).toBeNull();
    expect("noteHash" in out).toBe(false);
  });
});

describe("rewritePatientWhere", () => {
  it("zamienia równość i insensitive na skrót", () => {
    expect(rewritePatientWhere({ email: { equals: "A@B.pl", mode: "insensitive" } }, true)).toEqual({
      AND: [{ emailHash: blindIndex("email", "a@b.pl") }],
    });
    expect(rewritePatientWhere({ phone: "+48600100200", passwordHash: { not: null } }, true)).toEqual({
      passwordHash: { not: null },
      AND: [{ phoneHash: blindIndex("phone", "+48600100200") }],
    });
  });
  it("obsługuje OR, not i not null (także w relacji patient)", () => {
    const out = rewritePatientWhere({ patient: { OR: [{ email: { not: null } }, { pushSubscriptions: { some: {} } }] } }, false) as any;
    expect(out.patient.OR[0]).toEqual({ AND: [{ emailHash: { not: null } }] });
    expect(out.patient.OR[1]).toEqual({ pushSubscriptions: { some: {} } });
    const notName = rewritePatientWhere({ name: { not: "X" } }, true) as any;
    expect(notName.AND[0].OR).toEqual([{ nameHash: null }, { nameHash: { not: blindIndex("name", "X") } }]);
  });
  it("nie rusza pól innych modeli o tej samej nazwie", () => {
    expect(rewritePatientWhere({ name: { contains: "x" }, service: { name: { not: "Y" } } }, false)).toEqual({
      name: { contains: "x" },
      service: { name: { not: "Y" } },
    });
  });
  it("zgłasza błąd dla wyszukiwania częściowego po zaszyfrowanym polu", () => {
    expect(() => rewritePatientWhere({ name: { contains: "an" } }, true)).toThrow(/w pamięci/);
    expect(() => rewritePatientWhere({ patient: { phone: { startsWith: "+48" } } }, false)).toThrow(/w pamięci/);
  });
});

describe("patientMatches", () => {
  const p = { name: "Żaneta Łukasiewicz", email: "zaneta@example.com", phone: "+48 600 100 200" };
  it("szuka bez względu na wielkość liter i polskie znaki", () => {
    expect(patientMatches(p, "żANE")).toBe(true);
    expect(patientMatches(p, "ŁUKAS")).toBe(true);
    expect(patientMatches(p, "EXAMPLE")).toBe(true);
  });
  it("telefon: po cyfrach, niezależnie od formatowania", () => {
    expect(patientMatches(p, "600100")).toBe(true);
    expect(patientMatches(p, "600 100")).toBe(true);
    expect(patientMatches(p, "999")).toBe(false);
  });
  it("ogranicza się do wskazanych pól", () => {
    expect(patientMatches(p, "example", ["name"])).toBe(false);
  });
});
