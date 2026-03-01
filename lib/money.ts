export function formatPLNFromGrosze(value?: number | null) {
  if (value === null || value === undefined) return "—";
  const zł = value / 100;
  return zł.toLocaleString("pl-PL", { style: "currency", currency: "PLN" });
}

export function parsePLNToGrosze(input: string) {
  // accepts: "1234", "1234.56", "1 234,56"
  const normalized = input.replace(/\s/g, "").replace(",", ".");
  const num = Number(normalized);
  if (!Number.isFinite(num)) return null;
  return Math.round(num * 100);
}
