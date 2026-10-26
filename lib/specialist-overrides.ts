// Rozliczenie niestandardowe specjalisty za miesiąc: administrator wpisuje ręcznie liczbę zabiegów, przychód, koszt
// i wynagrodzenie, a te wartości zastępują policzone z wizyt — wszędzie, gdzie pokazujemy finanse specjalisty
// (rozliczenia, podsumowanie, szczegóły pracownika, analityka). Same wizyty, ceny i płatności zostają bez zmian.
// Nadpisanie obowiązuje, gdy wybrany zakres dat obejmuje CAŁY miesiąc (miesiące liczone wg czasu warszawskiego).

export type MonthOverride = {
  month: string; // RRRR-MM
  appointments: number | null;
  revenue: number | null; // grosze
  materialCost: number | null; // grosze
  payout: number | null; // grosze
  note: string | null;
};

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
export const isMonthKey = (value: string) => MONTH_RE.test(value);

const WARSAW = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Warsaw",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function warsawOffsetMs(at: Date): number {
  const parts = Object.fromEntries(WARSAW.formatToParts(at).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - at.getTime();
}

function warsawMidnight(year: number, month: number): Date {
  const naive = Date.UTC(year, month - 1, 1, 0, 0, 0);
  let guess = naive - warsawOffsetMs(new Date(naive));
  guess = naive - warsawOffsetMs(new Date(guess));
  return new Date(guess);
}

/** Początek (włącznie) i koniec (wyłącznie) miesiąca RRRR-MM w czasie warszawskim. */
export function warsawMonthRange(month: string): { start: Date; end: Date } {
  const m = MONTH_RE.exec(month);
  if (!m) throw new Error("Niepoprawny miesiąc");
  const year = Number(m[1]);
  const mon = Number(m[2]);
  return {
    start: warsawMidnight(year, mon),
    end: mon === 12 ? warsawMidnight(year + 1, 1) : warsawMidnight(year, mon + 1),
  };
}

const TOLERANCE_MS = 14 * 3600 * 1000;

/** Miesiące, które zakres [start, end) obejmuje w całości (z tolerancją na różnice stref czasowych). */
export function monthsCoveredBy(start: Date, end: Date): string[] {
  const months: string[] = [];
  // Zaczynamy od miesiąca, w którym leży początek zakresu (z zapasem na tolerancję), i idziemy do końca zakresu.
  const first = new Date(start.getTime() - TOLERANCE_MS);
  let year = first.getUTCFullYear();
  let month = first.getUTCMonth() + 1;
  for (let i = 0; i < 400; i++) {
    const key = `${year}-${String(month).padStart(2, "0")}`;
    const range = warsawMonthRange(key);
    if (range.start.getTime() >= end.getTime()) break;
    if (start.getTime() <= range.start.getTime() + TOLERANCE_MS && end.getTime() >= range.end.getTime() - TOLERANCE_MS) {
      months.push(key);
    }
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}

export type OverrideItem = { startsAt: Date; revenue: number; materialCost: number; payout: number; payoutFromProfit?: number };
export type OverrideResult = {
  count: number;
  revenue: number;
  materialCost: number;
  payout: number;
  payoutFromProfit: number;
  overriddenMonths: string[];
};

/**
 * Sumy dla specjalisty po zastosowaniu nadpisań: dla każdego nadpisanego miesiąca wartości policzone z wizyt tego
 * miesiąca zastępujemy wpisanymi (puste pole = zostaje wartość standardowa).
 */
export function applyMonthOverrides(items: OverrideItem[], overrides: MonthOverride[]): OverrideResult {
  const total: OverrideResult = {
    count: items.length,
    revenue: items.reduce((s, i) => s + i.revenue, 0),
    materialCost: items.reduce((s, i) => s + i.materialCost, 0),
    payout: items.reduce((s, i) => s + i.payout, 0),
    payoutFromProfit: items.reduce((s, i) => s + (i.payoutFromProfit ?? i.payout), 0),
    overriddenMonths: [],
  };
  for (const ov of overrides) {
    const { start, end } = warsawMonthRange(ov.month);
    const inMonth = items.filter((i) => i.startsAt.getTime() >= start.getTime() && i.startsAt.getTime() < end.getTime());
    const std = {
      count: inMonth.length,
      revenue: inMonth.reduce((s, i) => s + i.revenue, 0),
      materialCost: inMonth.reduce((s, i) => s + i.materialCost, 0),
      payout: inMonth.reduce((s, i) => s + i.payout, 0),
      payoutFromProfit: inMonth.reduce((s, i) => s + (i.payoutFromProfit ?? i.payout), 0),
    };
    total.count += (ov.appointments ?? std.count) - std.count;
    total.revenue += (ov.revenue ?? std.revenue) - std.revenue;
    total.materialCost += (ov.materialCost ?? std.materialCost) - std.materialCost;
    total.payout += (ov.payout ?? std.payout) - std.payout;
    total.payoutFromProfit += (ov.payout ?? std.payoutFromProfit) - std.payoutFromProfit;
    total.overriddenMonths.push(ov.month);
  }
  return total;
}
