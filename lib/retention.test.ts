import { describe, expect, it } from "vitest";
import { medicalRetentionEnd } from "./retention";

describe("okres przechowywania dokumentacji", () => {
  it("20 lat od końca roku ostatniego wpisu", () => {
    expect(medicalRetentionEnd(new Date("2026-03-10T10:00:00Z")).toISOString()).toBe("2046-12-31T23:59:59.000Z");
    expect(medicalRetentionEnd(new Date("2026-12-31T23:00:00Z")).getUTCFullYear()).toBe(2046);
  });
});
