import { describe, expect, it } from "vitest";
import { gtinToEan, parseScan } from "./barcode";

describe("parseScan", () => {
  it("rozpoznaje klasyczny kod EAN-13", () => {
    const result = parseScan("7629999518315");
    expect(result?.kind).toBe("plain");
    expect(result?.productCodes).toContain("7629999518315");
  });

  it("rozszyfrowuje GS1 bez separatorów", () => {
    const result = parseScan("01076401732323841025182CL0172804292125182CL04152");
    expect(result?.kind).toBe("gs1");
    if (result?.kind !== "gs1") return;
    expect(result.data).toEqual({
      gtin: "07640173232384",
      batchNumber: "25182CL0",
      expiryDate: "2028-04-29",
      serialNumber: "25182CL04152",
    });
    expect(result.productCodes).toContain("7640173232384");
    expect(gtinToEan(result.data.gtin!)).toBe("7640173232384");
  });

  it("rozszyfrowuje GS1 z separatorem GS i prefiksem symbologii", () => {
    const result = parseScan("]d201076401732323841725010110AB12\x1d21XY9");
    expect(result?.kind).toBe("gs1");
    if (result?.kind !== "gs1") return;
    expect(result.data.batchNumber).toBe("AB12");
    expect(result.data.serialNumber).toBe("XY9");
    expect(result.data.expiryDate).toBe("2025-01-01");
  });

  it("obsługuje zapis w nawiasach i dzień 00", () => {
    const result = parseScan("(01)07640173232384(17)280400(10)LOT1");
    expect(result?.kind === "gs1" && result.data.expiryDate).toBe("2028-04-30");
  });
});
