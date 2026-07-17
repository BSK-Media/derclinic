// Wspólna logika zakresów dat dla rozliczeń specjalistów.
// Używana zarówno przez listę rozliczeń, jak i szczegóły pracownika,
// dzięki czemu oba widoki liczą dokładnie ten sam okres.

export type SettlementRangeKey = "today" | "7d" | "30d" | "month" | "custom";

type DateParts = { year: number; month: number; day: number };

const WARSAW_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Warsaw",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function warsawParts(date = new Date()) {
  const parts = Object.fromEntries(
    WARSAW_FORMATTER.formatToParts(date).map((part) => [part.type, part.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function warsawMidnightToUtc({ year, month, day }: DateParts) {
  const targetAsUtc = Date.UTC(year, month - 1, day, 0, 0, 0);
  let guess = targetAsUtc;

  // Dwie iteracje uwzględniają zmianę czasu zimowego/letniego.
  for (let i = 0; i < 2; i += 1) {
    const current = warsawParts(new Date(guess));
    const currentAsUtc = Date.UTC(
      current.year,
      current.month - 1,
      current.day,
      current.hour,
      current.minute,
      current.second,
    );
    guess += targetAsUtc - currentAsUtc;
  }

  return new Date(guess);
}

function addDays(parts: DateParts, days: number): DateParts {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function parseDate(value: string | null): DateParts | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const test = new Date(Date.UTC(year, month - 1, day));
  if (
    test.getUTCFullYear() !== year ||
    test.getUTCMonth() + 1 !== month ||
    test.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

export type ResolvedSettlementRange = {
  range: SettlementRangeKey;
  start: Date;
  end: Date;
};

export function resolveSettlementRange(url: URL): ResolvedSettlementRange | null {
  const rawRange = url.searchParams.get("range");
  const range: SettlementRangeKey =
    rawRange === "today" ||
    rawRange === "7d" ||
    rawRange === "month" ||
    rawRange === "custom"
      ? rawRange
      : "30d";

  const now = warsawParts();
  const today: DateParts = { year: now.year, month: now.month, day: now.day };

  if (range === "today") {
    return {
      range,
      start: warsawMidnightToUtc(today),
      end: warsawMidnightToUtc(addDays(today, 1)),
    };
  }

  if (range === "7d") {
    return {
      range,
      start: warsawMidnightToUtc(addDays(today, -6)),
      end: warsawMidnightToUtc(addDays(today, 1)),
    };
  }

  if (range === "30d") {
    return {
      range,
      start: warsawMidnightToUtc(addDays(today, -29)),
      end: warsawMidnightToUtc(addDays(today, 1)),
    };
  }

  if (range === "month") {
    // Bieżący miesiąc kalendarzowy: od 1. dnia do końca miesiąca
    const monthStart: DateParts = { year: today.year, month: today.month, day: 1 };
    const nextMonthStart: DateParts =
      today.month === 12
        ? { year: today.year + 1, month: 1, day: 1 }
        : { year: today.year, month: today.month + 1, day: 1 };
    return {
      range,
      start: warsawMidnightToUtc(monthStart),
      end: warsawMidnightToUtc(nextMonthStart),
    };
  }

  // custom
  const from = parseDate(url.searchParams.get("from"));
  const to = parseDate(url.searchParams.get("to"));
  if (!from || !to) return null;

  const start = warsawMidnightToUtc(from);
  const end = warsawMidnightToUtc(addDays(to, 1));
  if (start >= end) return null;
  return { range, start, end };
}
