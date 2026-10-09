import { describe, expect, it } from "vitest";
import { botGuardRejects } from "./bot-guard";

describe("botGuardRejects", () => {
  const opened = (msAgo: number) => Date.now() - msAgo;

  it("przepuszcza normalne wysłanie formularza", () => {
    expect(botGuardRejects({ website: "", formOpenedAt: opened(20_000) })).toBe(false);
  });
  it("odrzuca wypełnione pole-pułapkę", () => {
    expect(botGuardRejects({ website: "http://spam", formOpenedAt: opened(20_000) })).toBe(true);
  });
  it("odrzuca zbyt szybkie wysłanie", () => {
    expect(botGuardRejects({ website: "", formOpenedAt: opened(500) })).toBe(true);
  });
  it("odrzuca brak lub nieprawidłowy czas otwarcia i zbyt stary formularz", () => {
    expect(botGuardRejects({ website: "" })).toBe(true);
    expect(botGuardRejects({ website: "", formOpenedAt: opened(2 * 24 * 3600_000) })).toBe(true);
  });
});
