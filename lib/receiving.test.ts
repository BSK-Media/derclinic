import { describe, expect, it } from "vitest";
import { addReceiptLine, mergeDuplicateLines, type ReceiptLine } from "./receiving";

function idGen() {
  let n = 0;
  return () => `l${++n}`;
}

const scan = { productRef: "p1", batchNumber: "25182CL0", serialNumber: "25182CL04152", expiryDate: "2028-04-29" };

describe("addReceiptLine", () => {
  it("zwiększa ilość przy kolejnych skanach tego samego opakowania", () => {
    const newId = idGen();
    let lines: ReceiptLine[] = [];
    for (let i = 0; i < 5; i++) lines = addReceiptLine(lines, scan, newId).lines;
    expect(lines).toHaveLength(1);
    expect(lines[0].quantity).toBe("5");
  });

  it("tworzy osobną pozycję dla innej partii, numeru seryjnego albo terminu", () => {
    const newId = idGen();
    let lines: ReceiptLine[] = [];
    lines = addReceiptLine(lines, scan, newId).lines;
    lines = addReceiptLine(lines, { ...scan, batchNumber: "INNA" }, newId).lines;
    lines = addReceiptLine(lines, { ...scan, serialNumber: "INNY" }, newId).lines;
    lines = addReceiptLine(lines, { ...scan, expiryDate: "2029-01-01" }, newId).lines;
    lines = addReceiptLine(lines, scan, newId).lines;
    expect(lines.map((l) => l.quantity)).toEqual(["2", "1", "1", "1"]);
  });

  it("ignoruje spacje na końcach numerów przy porównaniu", () => {
    const newId = idGen();
    let lines = addReceiptLine([], scan, newId).lines;
    const result = addReceiptLine(lines, { ...scan, batchNumber: " 25182CL0 " }, newId);
    lines = result.lines;
    expect(result.merged).toBe(true);
    expect(lines[0].quantity).toBe("2");
  });
});

describe("mergeDuplicateLines", () => {
  it("scala pozycje, które po edycji stały się identyczne", () => {
    const lines: ReceiptLine[] = [
      { id: "a", ...scan, quantity: "3" },
      { id: "b", ...scan, batchNumber: "INNA", quantity: "1" },
      { id: "c", ...scan, quantity: "2" },
    ];
    expect(mergeDuplicateLines(lines).map((l) => [l.id, l.quantity])).toEqual([
      ["a", "5"],
      ["b", "1"],
    ]);
  });
});
