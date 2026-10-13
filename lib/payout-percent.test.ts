import { describe, expect, it } from "vitest";
import { effectivePercent } from "./payout-percent";

describe("effectivePercent", () => {
  const overrides = new Map([["botox", 30]]);
  it("używa procentu ogólnego, gdy brak wyjątku", () => {
    expect(effectivePercent(50, overrides, "peeling")).toBe(50);
    expect(effectivePercent(50, undefined, "peeling")).toBe(50);
    expect(effectivePercent(50, overrides, null)).toBe(50);
  });
  it("wyjątek nadpisuje procent ogólny — także niższy lub zerowy", () => {
    expect(effectivePercent(50, overrides, "botox")).toBe(30);
    expect(effectivePercent(50, new Map([["x", 0]]), "x")).toBe(0);
    expect(effectivePercent(50, new Map([["x", 70]]), "x")).toBe(70);
  });
  it("brak procentu ogólnego traktuje jak 0", () => {
    expect(effectivePercent(null, undefined, "x")).toBe(0);
  });
});
