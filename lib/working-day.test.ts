import { describe, expect, it } from "vitest";
import { isWorkingOnDay } from "./public-booking";

// 2026-10-12 to poniedziałek (weekday = 0), 2026-10-13 wtorek (1).
const base = { year: 2026, month: 10, day: 12, workDays: [{ weekday: 0, startTime: "11:00", endTime: "20:00" }], customWorkDays: [], timeOffs: [] };

describe("isWorkingOnDay", () => {
  it("pracuje według grafiku tygodniowego", () => {
    expect(isWorkingOnDay(base)).toBe(true);
    expect(isWorkingOnDay({ ...base, day: 13 })).toBe(false);
  });
  it("niestandardowy dzień pracy włącza dzień poza grafikiem", () => {
    const custom = [{ date: "2026-10-13T00:00:00.000Z", startTime: "14:00", endTime: "19:00" }];
    expect(isWorkingOnDay({ ...base, day: 13, customWorkDays: custom })).toBe(true);
  });
  it("całodniowe wolne wyłącza dzień, wolne godziny nie", () => {
    const allDay = [{ date: "2026-10-12T00:00:00.000Z", allDay: true, startTime: null, endTime: null }];
    const hours = [{ date: "2026-10-12T00:00:00.000Z", allDay: false, startTime: "12:00", endTime: "13:00" }];
    expect(isWorkingOnDay({ ...base, timeOffs: allDay })).toBe(false);
    expect(isWorkingOnDay({ ...base, timeOffs: hours })).toBe(true);
  });
});
