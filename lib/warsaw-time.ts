// Wspólna logika stref czasowych dla publicznego panelu rezerwacji.
// Godziny pracy specjalistów (workDays/customWorkDays/timeOffs) są zapisane
// jako "zegarowe" HH:MM czasu warszawskiego, a wizyty (Appointment.startsAt)
// jako rzeczywiste znaczniki UTC. Te funkcje bezpiecznie konwertują między
// tymi dwiema reprezentacjami, uwzględniając zmianę czasu zimowego/letniego.

export type WarsawDateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

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

export function warsawParts(date = new Date()): WarsawDateTimeParts {
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

export function warsawDateKey(date = new Date()) {
  const p = warsawParts(date);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

// Zamienia zegarowy czas warszawski (np. 2026-06-10 09:00) na prawdziwy znacznik UTC.
export function warsawWallTimeToUtc(parts: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}): Date {
  const targetAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0);
  let guess = targetAsUtc;

  // Dwie iteracje wystarczają, aby uwzględnić przesunięcie czasu letniego/zimowego.
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

export function parseDateInput(value: string | null | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const test = new Date(Date.UTC(year, month - 1, day));
  if (test.getUTCFullYear() !== year || test.getUTCMonth() + 1 !== month || test.getUTCDate() !== day) {
    return null;
  }
  return { year, month, day };
}
