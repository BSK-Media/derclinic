import { describe, expect, it } from "vitest";
import { clip, diffFields, sanitizeAuditData } from "./audit-format";

describe("sanitizeAuditData", () => {
  it("ukrywa hasła, hashe i tokeny na każdej głębokości", () => {
    const out = sanitizeAuditData({
      login: "anna",
      password: "tajne",
      passwordHash: "$2a$10$abc",
      nested: { passwordResetTokenHash: "xyz", ok: 1 },
      list: [{ token: "t" }],
    }) as any;
    expect(out.login).toBe("anna");
    expect(out.password).toBe("[ukryte]");
    expect(out.passwordHash).toBe("[ukryte]");
    expect(out.nested.passwordResetTokenHash).toBe("[ukryte]");
    expect(out.nested.ok).toBe(1);
    expect(out.list[0].token).toBe("[ukryte]");
  });

  it("nie zapisuje zdjęć (data URL) i skraca bardzo długie teksty", () => {
    const out = sanitizeAuditData({
      photo: "data:image/png;base64," + "A".repeat(50_000),
      note: "x".repeat(5000),
    }) as any;
    expect(out.photo).toBe("[dane binarne]");
    expect(out.note.length).toBeLessThan(1100);
    expect(out.note).toContain("[+4000 znaków]");
  });

  it("zamienia Date na tekst ISO i obsługuje null/undefined", () => {
    const out = sanitizeAuditData({ at: new Date("2026-01-02T03:04:05.000Z"), none: null }) as any;
    expect(out.at).toBe("2026-01-02T03:04:05.000Z");
    expect(out.none).toBeNull();
    expect(sanitizeAuditData(undefined)).toBeNull();
    expect(sanitizeAuditData(null)).toBeNull();
  });

  it("nie przewraca się na referencji cyklicznej", () => {
    const a: any = {};
    a.self = a;
    expect(sanitizeAuditData(a)).toBeNull();
  });
});

describe("diffFields", () => {
  it("zwraca tylko zmienione pola z wartością przed i po", () => {
    const changes = diffFields(
      { status: "SCHEDULED", note: "a", priceFinal: 1000 },
      { status: "COMPLETED", note: "a", priceFinal: 1000 },
    );
    expect(changes).toEqual({ status: { from: "SCHEDULED", to: "COMPLETED" } });
  });

  it("pomija pola undefined (niezmieniane) i zwraca undefined, gdy nic się nie zmieniło", () => {
    expect(diffFields({ status: "SCHEDULED" }, { status: undefined })).toBeUndefined();
    expect(diffFields({ status: "SCHEDULED" }, { status: "SCHEDULED" })).toBeUndefined();
  });

  it("traktuje daty o tym samym momencie jako równe i null jak brak wartości", () => {
    const d = new Date("2026-05-05T10:00:00.000Z");
    expect(diffFields({ startsAt: d }, { startsAt: new Date(d.getTime()) })).toBeUndefined();
    expect(diffFields({ note: null }, { note: null })).toBeUndefined();
    expect(diffFields({ note: null }, { note: "x" })).toEqual({ note: { from: null, to: "x" } });
  });

  it("respektuje listę kluczy", () => {
    expect(diffFields({ a: 1, b: 1 }, { a: 2, b: 2 }, ["b"])).toEqual({ b: { from: 1, to: 2 } });
  });
});

describe("clip", () => {
  it("normalizuje białe znaki i skraca", () => {
    expect(clip("  a \n b  ")).toBe("a b");
    expect(clip("x".repeat(200), 10)).toBe("xxxxxxxxxx…");
    expect(clip(null)).toBe("");
  });
});
