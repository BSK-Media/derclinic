import { warsawParts, warsawWallTimeToUtc } from "@/lib/warsaw-time";

export type WorkDay = { weekday: number; startTime: string; endTime: string };
export type CustomWorkDay = { date: Date | string; startTime: string; endTime: string };
export type TimeOff = {
  date: Date | string;
  allDay: boolean;
  startTime: string | null;
  endTime: string | null;
};
export type BusyRange = { startMinutes: number; endMinutes: number };

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function dateKeyOf(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  // customWorkDays/timeOffs są zapisywane jako północ dnia, którego dotyczą —
  // odczytujemy datę bezpośrednio z UTC, tak samo jak reszta panelu admina.
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function timeToMinutes(value: string) {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToTime(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${pad(h)}:${pad(m)}`;
}

// Poniedziałek = 0 ... niedziela = 6, zgodnie z konwencją używaną w kalendarzu admina.
export function weekdayIndexMonday0(year: number, month: number, day: number) {
  const d = new Date(Date.UTC(year, month - 1, day));
  return (d.getUTCDay() + 6) % 7;
}

function workWindowForDay({
  year,
  month,
  day,
  workDays,
  customWorkDays,
  timeOffs,
}: {
  year: number;
  month: number;
  day: number;
  workDays: WorkDay[];
  customWorkDays: CustomWorkDay[];
  timeOffs: TimeOff[];
}) {
  const dateKey = `${year}-${pad(month)}-${pad(day)}`;
  const custom = customWorkDays.find((item) => dateKeyOf(item.date) === dateKey);
  const weekday = weekdayIndexMonday0(year, month, day);
  const regular = workDays.find((item) => item.weekday === weekday);
  const work = custom ?? regular;

  const dayOffs = timeOffs.filter((item) => dateKeyOf(item.date) === dateKey);
  if (!work || dayOffs.some((item) => item.allDay)) return null;

  const blockedRanges = dayOffs
    .filter((item) => !item.allDay && item.startTime && item.endTime)
    .map((item) => ({
      start: timeToMinutes(item.startTime!),
      end: timeToMinutes(item.endTime!),
    }));

  return {
    startMinutes: timeToMinutes(work.startTime),
    endMinutes: timeToMinutes(work.endTime),
    blockedRanges,
  };
}

// Zwraca dostępne godziny startu (HH:MM czasu warszawskiego) dla danego dnia.
export function computeFreeSlots({
  year,
  month,
  day,
  durationMin,
  stepMin = 15,
  workDays,
  customWorkDays,
  timeOffs,
  busyRanges,
  now,
  minLeadMinutes = 60,
}: {
  year: number;
  month: number;
  day: number;
  durationMin: number;
  stepMin?: number;
  workDays: WorkDay[];
  customWorkDays: CustomWorkDay[];
  timeOffs: TimeOff[];
  busyRanges: BusyRange[];
  now?: Date;
  // Ile minut wyprzedzenia wymagamy przy rezerwacji na dziś (żeby nie proponować terminu za 2 minuty).
  minLeadMinutes?: number;
}): string[] {
  const window = workWindowForDay({ year, month, day, workDays, customWorkDays, timeOffs });
  if (!window) return [];

  let minStartMinutes = window.startMinutes;
  if (now) {
    const nowParts = warsawParts(now);
    const isToday = nowParts.year === year && nowParts.month === month && nowParts.day === day;
    if (isToday) {
      minStartMinutes = Math.max(minStartMinutes, nowParts.hour * 60 + nowParts.minute + minLeadMinutes);
    } else {
      const nowAsDayNumber = nowParts.year * 10000 + nowParts.month * 100 + nowParts.day;
      const dayAsNumber = year * 10000 + month * 100 + day;
      if (dayAsNumber < nowAsDayNumber) return [];
    }
  }

  const slots: string[] = [];
  for (let start = window.startMinutes; start + durationMin <= window.endMinutes; start += stepMin) {
    if (start < minStartMinutes) continue;
    const end = start + durationMin;
    const overlapsBlocked = window.blockedRanges.some((r) => start < r.end && end > r.start);
    if (overlapsBlocked) continue;
    const overlapsBusy = busyRanges.some((r) => start < r.endMinutes && end > r.startMinutes);
    if (overlapsBusy) continue;
    slots.push(minutesToTime(start));
  }
  return slots;
}

// Konwertuje wizyty (UTC) danego specjalisty na zajęte przedziały minut w warszawskim dniu.
export function busyRangesForWarsawDay(
  appointments: { startsAt: Date; endsAt: Date }[],
  year: number,
  month: number,
  day: number,
): BusyRange[] {
  const dateKey = `${year}-${pad(month)}-${pad(day)}`;
  const ranges: BusyRange[] = [];
  for (const appt of appointments) {
    const startParts = warsawParts(appt.startsAt);
    const startKey = `${startParts.year}-${pad(startParts.month)}-${pad(startParts.day)}`;
    const endParts = warsawParts(appt.endsAt);
    const endKey = `${endParts.year}-${pad(endParts.month)}-${pad(endParts.day)}`;

    const startMinutes = startKey === dateKey ? startParts.hour * 60 + startParts.minute : 0;
    const endMinutes = endKey === dateKey ? endParts.hour * 60 + endParts.minute : 24 * 60;
    if (startKey > dateKey || endKey < dateKey) continue;
    ranges.push({ startMinutes, endMinutes });
  }
  return ranges;
}

export function slotToUtc(year: number, month: number, day: number, time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return warsawWallTimeToUtc({ year, month, day, hour, minute });
}
