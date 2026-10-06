import { describe, expect, it } from "vitest";
import { buildIcs, googleCalendarUrl } from "./calendar-links";

const event = {
  id: "abc",
  title: "Botoks, część 1 — DerClinic",
  description: "Specjalista: Anna",
  location: "DerClinic, Grodzisk",
  startsAt: new Date("2026-10-12T12:30:00.000Z"),
  endsAt: new Date("2026-10-12T13:30:00.000Z"),
};

describe("kalendarz klienta", () => {
  it("buduje poprawny plik .ics (UTC, CRLF, ucieczka znaków)", () => {
    const ics = buildIcs(event, new Date("2026-10-06T10:00:00.000Z"));
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("DTSTART:20261012T123000Z");
    expect(ics).toContain("DTEND:20261012T133000Z");
    expect(ics).toContain("UID:abc@derclinic");
    expect(ics).toContain(String.raw`SUMMARY:Botoks\, część 1`);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    for (const line of ics.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });

  it("buduje link do Google Kalendarza", () => {
    const url = new URL(googleCalendarUrl(event));
    expect(url.origin + url.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(url.searchParams.get("dates")).toBe("20261012T123000Z/20261012T133000Z");
    expect(url.searchParams.get("text")).toBe(event.title);
  });
});
