// Dodawanie wizyty do kalendarza klienta: plik .ics (iPhone/iPad/Mac, Outlook,
// Android) oraz gotowy link do Google Kalendarza (Android). Czyste funkcje —
// bez bazy i bez next/headers.

export type CalendarEvent = {
  id: string;
  title: string;
  description?: string | null;
  location?: string | null;
  startsAt: Date;
  endsAt: Date;
  // Zmiana terminu/szczegółów podnosi numer wersji, więc kalendarz klienta
  // aktualizuje wydarzenie zamiast dublować.
  updatedAt?: Date;
};

/** 20261012T123000Z */
function utcStamp(date: Date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

// Linie .ics nie powinny przekraczać 75 bajtów — dłuższe składa się z
// kontynuacją zaczynającą się spacją.
function fold(line: string) {
  const out: string[] = [];
  let current = "";
  let bytes = 0;
  for (const char of line) {
    const size = new TextEncoder().encode(char).length;
    if (bytes + size > 74) {
      out.push(current);
      current = " " + char;
      bytes = 1 + size;
    } else {
      current += char;
      bytes += size;
    }
  }
  out.push(current);
  return out.join("\r\n");
}

export function buildIcs(event: CalendarEvent, now = new Date()) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//DerClinic//Panel klienta//PL",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.id}@derclinic`,
    `DTSTAMP:${utcStamp(now)}`,
    `SEQUENCE:${Math.floor((event.updatedAt ?? now).getTime() / 1000)}`,
    `DTSTART:${utcStamp(event.startsAt)}`,
    `DTEND:${utcStamp(event.endsAt)}`,
    `SUMMARY:${escapeText(event.title)}`,
    ...(event.description ? [`DESCRIPTION:${escapeText(event.description)}`] : []),
    ...(event.location ? [`LOCATION:${escapeText(event.location)}`] : []),
    "STATUS:CONFIRMED",
    // Przypomnienie dzień przed wizytą.
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeText(event.title)}`,
    "TRIGGER:-P1D",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

export function googleCalendarUrl(event: CalendarEvent) {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${utcStamp(event.startsAt)}/${utcStamp(event.endsAt)}`,
  });
  if (event.description) params.set("details", event.description);
  if (event.location) params.set("location", event.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
