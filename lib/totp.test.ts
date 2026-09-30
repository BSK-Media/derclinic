import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, currentStep, generateTotpSecret, totpForStep, verifyTotp } from "./totp";

// Wektory testowe z RFC 6238, dodatek B (HMAC-SHA1, sekret "12345678901234567890").
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));
const RFC_VECTORS: Array<[number, string]> = [
  [59, "94287082"],
  [1111111109, "07081804"],
  [1111111111, "14050471"],
  [1234567890, "89005924"],
  [2000000000, "69279037"],
];

describe("TOTP (RFC 6238)", () => {
  it("base32 działa w obie strony", () => {
    const secret = generateTotpSecret();
    expect(base32Encode(base32Decode(secret))).toBe(secret);
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
  });

  it("zgadza się z wektorami testowymi RFC (6 ostatnich cyfr)", () => {
    for (const [time, expected8] of RFC_VECTORS) {
      expect(totpForStep(RFC_SECRET, Math.floor(time / 30))).toBe(expected8.slice(-6));
    }
  });

  it("akceptuje kod z bieżącego i sąsiednich kroków, odrzuca starsze", () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    const step = currentStep(now);
    expect(verifyTotp(secret, totpForStep(secret, step), { nowMs: now })).toBe(step);
    expect(verifyTotp(secret, totpForStep(secret, step - 1), { nowMs: now })).toBe(step - 1);
    expect(verifyTotp(secret, totpForStep(secret, step - 3), { nowMs: now })).toBeNull();
  });

  it("nie pozwala użyć tego samego kodu drugi raz", () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    const step = currentStep(now);
    const code = totpForStep(secret, step);
    expect(verifyTotp(secret, code, { nowMs: now, lastUsedStep: step })).toBeNull();
  });

  it("odrzuca kody w złym formacie", () => {
    const secret = generateTotpSecret();
    expect(verifyTotp(secret, "12345")).toBeNull();
    expect(verifyTotp(secret, "abcdef")).toBeNull();
  });
});
