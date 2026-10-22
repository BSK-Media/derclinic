import { describe, expect, it } from "vitest";
import { isAppointmentEnded } from "./appointment-status";

const now = new Date("2026-10-22T12:00:00Z");

describe("isAppointmentEnded", () => {
  it("traktuje minioną wizytę bez zmiany statusu jako odbytą", () => {
    expect(
      isAppointmentEnded({ status: "SCHEDULED", startsAt: "2026-10-21T09:00:00Z", endsAt: "2026-10-21T10:00:00Z" }, now),
    ).toBe(true);
  });

  it("nie traktuje trwającej ani przyszłej wizyty jako odbytej", () => {
    expect(
      isAppointmentEnded({ status: "SCHEDULED", startsAt: "2026-10-22T11:30:00Z", endsAt: "2026-10-22T12:30:00Z" }, now),
    ).toBe(false);
    expect(isAppointmentEnded({ status: "SCHEDULED", startsAt: "2026-10-23T09:00:00Z" }, now)).toBe(false);
  });

  it("zakończona wizyta liczy się zawsze, odwołana i nieobecność nigdy", () => {
    expect(isAppointmentEnded({ status: "COMPLETED", startsAt: "2026-10-23T09:00:00Z" }, now)).toBe(true);
    expect(isAppointmentEnded({ status: "CANCELED", startsAt: "2026-10-21T09:00:00Z" }, now)).toBe(false);
    expect(isAppointmentEnded({ status: "NO_SHOW", startsAt: "2026-10-21T09:00:00Z" }, now)).toBe(false);
  });
});
