// Vouchery (karty podarunkowe) i pakiety zabiegów: kody, saldo i status. Czysta logika.

export type BenefitStatus = "ACTIVE" | "EXHAUSTED" | "EXPIRED" | "CANCELED";

export const BENEFIT_STATUS_LABELS: Record<BenefitStatus, string> = {
  ACTIVE: "Aktywny",
  EXHAUSTED: "Wykorzystany",
  EXPIRED: "Wygasły",
  CANCELED: "Anulowany",
};

/** Koniec dnia ważności (czas lokalny serwera nie ma znaczenia — porównujemy z końcem wskazanej doby UTC+1/+2 z zapasem). */
export function endOfExpiryDay(date: Date): Date {
  return new Date(date.getTime() + 24 * 3600 * 1000 - 1);
}

export function benefitStatus(input: {
  canceledAt: Date | null;
  expiresAt: Date | null;
  remaining: number;
  now?: Date;
}): BenefitStatus {
  const now = input.now ?? new Date();
  if (input.canceledAt) return "CANCELED";
  if (input.remaining <= 0) return "EXHAUSTED";
  if (input.expiresAt && endOfExpiryDay(input.expiresAt).getTime() < now.getTime()) return "EXPIRED";
  return "ACTIVE";
}

/** Saldo vouchera w groszach: kwota minus suma płatności z tego vouchera. */
export function voucherRemaining(amount: number, payments: { amount: number }[]): number {
  return Math.max(0, amount - payments.reduce((sum, p) => sum + p.amount, 0));
}

/** Pozostałe zabiegi w pakiecie: łączna liczba minus zużyte (płatności pakietem). */
export function packageSessionsLeft(total: number, payments: { packageSessions: number | null }[]): number {
  return Math.max(0, total - payments.reduce((sum, p) => sum + (p.packageSessions ?? 0), 0));
}

/** Data w formacie z pola <input type="date"> (RRRR-MM-DD) → północ UTC tego dnia; puste = brak terminu. */
export function parseExpiryDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}
