// Stawki VAT i wyliczanie podatku z cen brutto (POS sprzedaje po cenach brutto).
// VAT sprzedaży liczymy osobno dla każdej stawki od sumy brutto — tak samo jak
// drukarka fiskalna na paragonie, żeby kwoty w systemie zgadzały się z paragonem.

export type VatRateCode = "VAT_23" | "VAT_8" | "VAT_5" | "VAT_0" | "ZW";

export const VAT_RATES: { value: VatRateCode; label: string; percent: number }[] = [
  { value: "VAT_23", label: "23%", percent: 23 },
  { value: "VAT_8", label: "8%", percent: 8 },
  { value: "VAT_5", label: "5%", percent: 5 },
  { value: "VAT_0", label: "0%", percent: 0 },
  { value: "ZW", label: "zw.", percent: 0 },
];

export const VAT_RATE_VALUES = VAT_RATES.map((rate) => rate.value) as [VatRateCode, ...VatRateCode[]];

const BY_CODE = new Map(VAT_RATES.map((rate) => [rate.value, rate] as const));

export function vatRateLabel(rate: string | null | undefined) {
  return BY_CODE.get(rate as VatRateCode)?.label ?? "—";
}

export function vatPercent(rate: string | null | undefined) {
  return BY_CODE.get(rate as VatRateCode)?.percent ?? 0;
}

/** VAT zawarty w kwocie brutto (grosze). */
export function vatFromGross(gross: number, rate: string | null | undefined) {
  const percent = vatPercent(rate);
  if (!percent) return 0;
  return Math.round((gross * percent) / (100 + percent));
}

/**
 * Rozkłada zniżkę na pozycje proporcjonalnie do ich wartości (metoda największych
 * reszt), żeby suma po zniżce zgadzała się co do grosza. Zwraca kwoty pozycji po zniżce.
 */
export function allocateDiscount(lineTotals: number[], discount: number): number[] {
  const subtotal = lineTotals.reduce((sum, value) => sum + value, 0);
  if (discount <= 0 || subtotal <= 0) return [...lineTotals];
  const capped = Math.min(discount, subtotal);
  const shares = lineTotals.map((value) => (value * capped) / subtotal);
  const floors = shares.map(Math.floor);
  let rest = capped - floors.reduce((sum, value) => sum + value, 0);
  const order = shares
    .map((share, index) => ({ index, remainder: share - Math.floor(share) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const { index } of order) {
    if (rest <= 0) break;
    floors[index] += 1;
    rest -= 1;
  }
  return lineTotals.map((value, index) => value - floors[index]);
}

export type VatLine = { gross: number; vatRate: string };
export type VatSummaryRow = { vatRate: VatRateCode; gross: number; vat: number; net: number };

/** Zestawienie VAT per stawka (kolejność jak w VAT_RATES), z pominięciem pustych stawek. */
export function vatSummary(lines: VatLine[]): VatSummaryRow[] {
  const grossByRate = new Map<VatRateCode, number>();
  for (const line of lines) {
    const rate = (BY_CODE.has(line.vatRate as VatRateCode) ? line.vatRate : "VAT_23") as VatRateCode;
    grossByRate.set(rate, (grossByRate.get(rate) ?? 0) + line.gross);
  }
  return VAT_RATES.filter((rate) => grossByRate.has(rate.value)).map((rate) => {
    const gross = grossByRate.get(rate.value)!;
    const vat = vatFromGross(gross, rate.value);
    return { vatRate: rate.value, gross, vat, net: gross - vat };
  });
}

/** Weryfikacja polskiego NIP (10 cyfr z cyfrą kontrolną); dopuszcza myślniki, spacje i prefiks PL. */
export function normalizeNip(input: string): string | null {
  const digits = input.replace(/^\s*PL/i, "").replace(/[\s-]/g, "");
  if (!/^\d{10}$/.test(digits)) return null;
  const weights = [6, 5, 7, 2, 3, 4, 5, 6, 7];
  const sum = weights.reduce((acc, weight, index) => acc + weight * Number(digits[index]), 0);
  const check = sum % 11;
  if (check === 10 || check !== Number(digits[9])) return null;
  return digits;
}
