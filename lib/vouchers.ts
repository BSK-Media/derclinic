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

export type PackageItemUsage = {
  id: string;
  serviceId: string | null;
  sessions: number;
};

/** Pozostałe zabiegi w każdej pozycji pakietu (usłudze): liczba zabiegów pozycji minus jej rozliczenia. */
export function packageItemsLeft<T extends PackageItemUsage>(
  items: T[],
  payments: { patientPackageItemId: string | null; packageSessions: number | null }[],
): (T & { left: number })[] {
  return items.map((item) => ({
    ...item,
    left: Math.max(
      0,
      item.sessions -
        payments.filter((p) => p.patientPackageItemId === item.id).reduce((sum, p) => sum + (p.packageSessions ?? 0), 0),
    ),
  }));
}

/** Pozycja pakietu, z której rozlicza się wizyta danej usługi: najpierw ta sama usługa, potem pozycja „dowolna usługa”. */
export function packageItemForService<T extends PackageItemUsage>(items: T[], serviceId: string | null): T | null {
  return items.find((item) => item.serviceId && item.serviceId === serviceId) ?? items.find((item) => !item.serviceId) ?? null;
}

/** Wartość pakietu w cenach standardowych (grosze); null, gdy któraś usługa nie ma ceny. */
export function packageStandardValue(items: { sessions: number; unitPrice: number | null | undefined }[]): number | null {
  if (items.length === 0 || items.some((item) => item.unitPrice === null || item.unitPrice === undefined)) return null;
  return items.reduce((sum, item) => sum + item.sessions * (item.unitPrice ?? 0), 0);
}

/** Data w formacie z pola <input type="date"> (RRRR-MM-DD) → północ UTC tego dnia; puste = brak terminu. */
export function parseExpiryDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}
