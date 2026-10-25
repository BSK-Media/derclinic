import { describe, expect, it } from "vitest";
import { benefitStatus, packageSessionsLeft, parseExpiryDate, voucherRemaining } from "./vouchers";
import { generateCode } from "./voucher-code";

describe("kody", () => {
  it("mają prefiks i czytelny alfabet", () => {
    for (let i = 0; i < 50; i++) {
      expect(generateCode("V")).toMatch(/^V-[A-HJKMNP-Z2-9]{6}$/);
    }
    expect(generateCode("P")).toMatch(/^P-/);
  });
});

describe("saldo i status vouchera", () => {
  it("saldo = kwota minus płatności", () => {
    expect(voucherRemaining(100000, [{ amount: 30000 }, { amount: 20000 }])).toBe(50000);
    expect(voucherRemaining(10000, [{ amount: 20000 }])).toBe(0);
  });
  const now = new Date("2026-10-25T12:00:00Z");
  it("aktywny, wykorzystany, wygasły i anulowany", () => {
    expect(benefitStatus({ canceledAt: null, expiresAt: null, remaining: 500, now })).toBe("ACTIVE");
    expect(benefitStatus({ canceledAt: null, expiresAt: null, remaining: 0, now })).toBe("EXHAUSTED");
    expect(benefitStatus({ canceledAt: null, expiresAt: new Date("2026-10-01T00:00:00Z"), remaining: 500, now })).toBe("EXPIRED");
    expect(benefitStatus({ canceledAt: new Date(), expiresAt: null, remaining: 500, now })).toBe("CANCELED");
  });
  it("w ostatnim dniu ważności voucher jeszcze działa", () => {
    expect(benefitStatus({ canceledAt: null, expiresAt: new Date("2026-10-25T00:00:00Z"), remaining: 500, now })).toBe("ACTIVE");
  });
});

describe("pakiety", () => {
  it("liczy pozostałe zabiegi", () => {
    expect(packageSessionsLeft(10, [{ packageSessions: 1 }, { packageSessions: 2 }, { packageSessions: null }])).toBe(7);
    expect(packageSessionsLeft(3, [{ packageSessions: 5 }])).toBe(0);
  });
});

describe("termin ważności", () => {
  it("parsuje datę z pola, puste = brak terminu, zły format = undefined", () => {
    expect(parseExpiryDate("2026-12-31")?.toISOString()).toBe("2026-12-31T00:00:00.000Z");
    expect(parseExpiryDate("")).toBeNull();
    expect(parseExpiryDate("31.12.2026")).toBeUndefined();
  });
});
