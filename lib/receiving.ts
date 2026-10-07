// Przyjęcie dostawy skanerem: każdy skan to jedno opakowanie. Skany tego samego produktu
// z tą samą partią, numerem seryjnym i terminem ważności zwiększają ilość jednej pozycji;
// inna partia, numer albo termin tworzy osobną pozycję (osobną partię w magazynie).

export type ReceiptLine = {
  id: string;
  // Id istniejącego produktu albo "new:<id szkicu>" dla produktu zakładanego przy przyjęciu.
  productRef: string;
  batchNumber: string;
  serialNumber: string;
  expiryDate: string; // YYYY-MM-DD albo ""
  quantity: string;
};

export type ReceiptLineInput = Omit<ReceiptLine, "id" | "quantity"> & { quantity?: number };

export function receiptLineKey(line: Pick<ReceiptLine, "productRef" | "batchNumber" | "serialNumber" | "expiryDate">) {
  return [line.productRef, line.batchNumber.trim(), line.serialNumber.trim(), line.expiryDate].join("|");
}

export function parseQuantity(value: string) {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatQuantity(value: number) {
  return String(Math.round(value * 100) / 100);
}

/** Dopisuje skan do listy: zwiększa ilość pasującej pozycji albo dodaje nową na końcu. */
export function addReceiptLine(
  lines: ReceiptLine[],
  input: ReceiptLineInput,
  newId: () => string,
): { lines: ReceiptLine[]; line: ReceiptLine; merged: boolean } {
  const amount = input.quantity ?? 1;
  const key = receiptLineKey(input);
  const index = lines.findIndex((line) => receiptLineKey(line) === key);
  if (index !== -1) {
    const line = { ...lines[index], quantity: formatQuantity(parseQuantity(lines[index].quantity) + amount) };
    return { lines: lines.map((current, i) => (i === index ? line : current)), line, merged: true };
  }
  const line: ReceiptLine = {
    id: newId(),
    productRef: input.productRef,
    batchNumber: input.batchNumber.trim(),
    serialNumber: input.serialNumber.trim(),
    expiryDate: input.expiryDate,
    quantity: formatQuantity(amount),
  };
  return { lines: [...lines, line], line, merged: false };
}

/**
 * Po ręcznej zmianie pozycji (partia, numer, termin) może się ona zrównać z inną —
 * wtedy scalamy je w jedną, sumując ilości (zostaje pierwsza na liście).
 */
export function mergeDuplicateLines(lines: ReceiptLine[]): ReceiptLine[] {
  const result: ReceiptLine[] = [];
  const byKey = new Map<string, number>();
  for (const line of lines) {
    const key = receiptLineKey(line);
    const existing = byKey.get(key);
    if (existing === undefined) {
      byKey.set(key, result.length);
      result.push(line);
    } else {
      const target = result[existing];
      result[existing] = {
        ...target,
        quantity: formatQuantity(parseQuantity(target.quantity) + parseQuantity(line.quantity)),
      };
    }
  }
  return result;
}
