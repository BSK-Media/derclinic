import { describe, expect, it } from "vitest";
import {
  appointmentIdFromPaymentToken,
  formatAccount,
  formatPhone,
  generatePaymentReference,
  isValidPolishAccount,
  paymentToken,
} from "./payment-request";

describe("płatności ręczne", () => {
  it("generuje tytuł płatności z czytelnych znaków", () => {
    for (let i = 0; i < 200; i++) {
      expect(generatePaymentReference()).toMatch(/^DC-[A-HJ-NP-Z2-9]{6}$/);
    }
    expect(new Set(Array.from({ length: 100 }, generatePaymentReference)).size).toBeGreaterThan(95);
  });

  it("link do płatności działa tylko z poprawnym podpisem", () => {
    const token = paymentToken("appt1");
    expect(appointmentIdFromPaymentToken(token)).toBe("appt1");
    expect(appointmentIdFromPaymentToken(token.replace("appt1", "appt2"))).toBeNull();
    expect(appointmentIdFromPaymentToken("appt1.zly")).toBeNull();
  });

  it("waliczuje polski numer konta (suma kontrolna)", () => {
    // Przykładowy poprawny NRB.
    expect(isValidPolishAccount("61 1090 1014 0000 0712 1981 2874")).toBe(true);
    expect(isValidPolishAccount("PL61109010140000071219812874")).toBe(true);
    expect(isValidPolishAccount("61 1090 1014 0000 0712 1981 2875")).toBe(false);
    expect(isValidPolishAccount("123")).toBe(false);
  });

  it("formatuje numer konta i telefon", () => {
    expect(formatAccount("61109010140000071219812874")).toBe("61 1090 1014 0000 0712 1981 2874");
    expect(formatPhone("660027421")).toBe("+48 660 027 421");
    expect(formatPhone("+48660027421")).toBe("+48 660 027 421");
  });
});
