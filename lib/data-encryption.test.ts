import { describe, expect, it } from "vitest";
import { decryptDeep, decryptField, encryptField, encryptWriteArgs, isEncrypted } from "./data-encryption";

describe("szyfrowanie danych medycznych (audyt F-09/F-10)", () => {
  it("szyfruje i odszyfrowuje tekst i zdjęcie", () => {
    const photo = "data:image/jpeg;base64," + "A".repeat(1000);
    const sealed = encryptField(photo)!;
    expect(isEncrypted(sealed)).toBe(true);
    expect(sealed).not.toContain("AAAA");
    expect(decryptField(sealed)).toBe(photo);
  });

  it("za każdym razem daje inny szyfrogram (losowy IV)", () => {
    expect(encryptField("notatka")).not.toBe(encryptField("notatka"));
  });

  it("dane sprzed wdrożenia (bez prefiksu) odczytuje bez zmian", () => {
    expect(decryptField("stara notatka")).toBe("stara notatka");
    expect(decryptField(null)).toBeNull();
  });

  it("wykrywa zmodyfikowany szyfrogram", () => {
    const sealed = encryptField("alergia")!;
    const tampered = sealed.slice(0, -4) + (sealed.endsWith("AAAA") ? "BBBB" : "AAAA");
    expect(decryptField(tampered)).toBeNull();
  });

  it("odrzuca skrócony znacznik uwierzytelniający (GCM)", () => {
    const sealed = encryptField("alergia")!;
    const parts = sealed.split(".");
    const shortTag = Buffer.from(parts[parts.length - 1], "base64url").subarray(0, 4).toString("base64url");
    expect(decryptField([...parts.slice(0, -1), shortTag].join("."))).toBeNull();
  });

  it("szyfruje tylko wskazane pola w argumentach zapisu", () => {
    const args = encryptWriteArgs("appointment", "update", {
      where: { id: "a1" },
      data: { note: "tekst", status: "COMPLETED", photoBefore: null },
    });
    expect(isEncrypted(args.data.note)).toBe(true);
    expect(args.data.status).toBe("COMPLETED");
    expect(args.data.photoBefore).toBeNull();
  });

  it("odszyfrowuje zagnieżdżone wyniki (include)", () => {
    const result = decryptDeep({
      id: "a1",
      startsAt: new Date("2026-01-01"),
      note: encryptField("wizyta"),
      patient: { name: "Anna", note: encryptField("pacjent") },
      list: [{ note: encryptField("x") }],
    });
    expect(result.note).toBe("wizyta");
    expect(result.patient.note).toBe("pacjent");
    expect(result.list[0].note).toBe("x");
    expect(result.startsAt).toBeInstanceOf(Date);
  });
});
