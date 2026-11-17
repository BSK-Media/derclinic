import { describe, expect, it } from "vitest";
import { PercentTimeline } from "./percent-history";

const d = (iso: string) => new Date(iso);
const epoch = d("1970-01-01T00:00:00Z");

describe("historia procentu specjalisty", () => {
  it("zmiana ogólnego procentu działa tylko od momentu zmiany", () => {
    const timeline = new PercentTimeline(
      [
        { serviceId: null, percent: 40, effectiveFrom: epoch },
        { serviceId: null, percent: 50, effectiveFrom: d("2026-11-10T09:00:00Z") },
      ],
      50,
    );
    expect(timeline.at("s1", d("2026-10-20T10:00:00Z"))).toBe(40);
    expect(timeline.at("s1", d("2026-11-10T08:59:00Z"))).toBe(40);
    expect(timeline.at("s1", d("2026-11-10T09:00:00Z"))).toBe(50);
    expect(timeline.at(null, d("2027-01-01T00:00:00Z"))).toBe(50);
  });

  it("wyjątek od zabiegu nadpisuje ogólny, a jego usunięcie przywraca ogólny od tej chwili", () => {
    const timeline = new PercentTimeline(
      [
        { serviceId: null, percent: 40, effectiveFrom: epoch },
        { serviceId: "botox", percent: 60, effectiveFrom: epoch },
        { serviceId: "botox", percent: null, effectiveFrom: d("2026-11-05T00:00:00Z") },
      ],
      40,
    );
    expect(timeline.at("botox", d("2026-11-01T00:00:00Z"))).toBe(60);
    expect(timeline.at("botox", d("2026-11-06T00:00:00Z"))).toBe(40);
    expect(timeline.at("inny", d("2026-11-01T00:00:00Z"))).toBe(40);
  });

  it("bez historii używa wartości bieżących", () => {
    const timeline = new PercentTimeline([], 45, new Map([["botox", 70]]));
    expect(timeline.at("botox", d("2026-11-01T00:00:00Z"))).toBe(70);
    expect(timeline.at("inny", d("2026-11-01T00:00:00Z"))).toBe(45);
  });

  it("przed pierwszym wpisem obowiązuje najstarszy znany procent", () => {
    const timeline = new PercentTimeline([{ serviceId: null, percent: 55, effectiveFrom: d("2026-06-01T00:00:00Z") }], 99);
    expect(timeline.at(null, d("2026-01-01T00:00:00Z"))).toBe(55);
  });
});
