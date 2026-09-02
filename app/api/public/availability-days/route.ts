import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseDateInput, warsawWallTimeToUtc } from "@/lib/warsaw-time";
import { busyRangesForWarsawDay, computeFreeSlots } from "@/lib/public-booking";

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

function dateKey(p: { year: number; month: number; day: number }) {
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

// Zwraca tylko informację, czy dany dzień ma JAKIKOLWIEK wolny termin (bez listy
// godzin) — używane do wyszarzania pustych dni na pasku tygodnia, jednym zapytaniem
// dla całego widocznego zakresu zamiast osobno dla każdego dnia.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const serviceId = url.searchParams.get("serviceId") ?? "";
  const specialistId = url.searchParams.get("specialistId") ?? "";
  const locationId = url.searchParams.get("locationId") ?? "";
  const datesParam = url.searchParams.get("dates") ?? "";

  if (!serviceId) return bad("Brak wybranego zabiegu");
  const dateParams = datesParam
    .split(",")
    .map((d) => parseDateInput(d))
    .filter((d): d is { year: number; month: number; day: number } => Boolean(d));
  if (dateParams.length === 0) return bad("Brak dat do sprawdzenia");
  if (!specialistId && !locationId) return bad("Brak specjalisty lub lokalizacji");

  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    select: { id: true, durationMin: true },
  });
  if (!service) return bad("Nie znaleziono usługi", 404);

  const sorted = [...dateParams].sort((a, b) => (dateKey(a) < dateKey(b) ? -1 : 1));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const rangeStart = new Date(
    warsawWallTimeToUtc({ ...first, hour: 0, minute: 0 }).getTime() - 4 * 60 * 60 * 1000,
  );
  const rangeEnd = new Date(
    warsawWallTimeToUtc({ ...last, hour: 23, minute: 59 }).getTime() + 4 * 60 * 60 * 1000,
  );
  const now = new Date();
  const days: Record<string, boolean> = {};

  if (specialistId) {
    const specialist = await prisma.user.findFirst({
      where: { id: specialistId, role: "SPECIALIST", isVisible: true },
      select: { id: true, workDays: true, assignedServices: { select: { serviceId: true } } },
    });
    if (!specialist) return bad("Nie znaleziono specjalisty", 404);
    if (!specialist.assignedServices.some((a) => a.serviceId === serviceId)) {
      return bad("Ten specjalista nie wykonuje wybranej usługi");
    }

    const [customWorkDays, timeOffs, appointments] = await Promise.all([
      prisma.specialistCustomWorkDay.findMany({
        where: { specialistId, date: { gte: rangeStart, lte: rangeEnd } },
        select: { date: true, startTime: true, endTime: true },
      }),
      prisma.specialistTimeOff.findMany({
        where: { specialistId, date: { gte: rangeStart, lte: rangeEnd } },
        select: { date: true, allDay: true, startTime: true, endTime: true },
      }),
      prisma.appointment.findMany({
        where: {
          specialistId,
          deletedAt: null,
          status: { notIn: ["CANCELED", "NO_SHOW"] },
          startsAt: { lte: rangeEnd },
          endsAt: { gte: rangeStart },
        },
        select: { startsAt: true, endsAt: true },
      }),
    ]);

    for (const d of dateParams) {
      const busyRanges = busyRangesForWarsawDay(appointments, d.year, d.month, d.day);
      const freeSlots = computeFreeSlots({
        ...d,
        durationMin: service.durationMin,
        workDays: specialist.workDays,
        customWorkDays,
        timeOffs,
        busyRanges,
        now,
      });
      days[dateKey(d)] = freeSlots.length > 0;
    }

    return NextResponse.json({ ok: true, days });
  }

  // Tryb "dowolny specjalista": dzień jest dostępny, jeśli choć jeden
  // uprawniony specjalista ma wolny termin.
  const specialists = await prisma.user.findMany({
    where: {
      role: "SPECIALIST",
      isVisible: true,
      ...(locationId ? { locationId } : {}),
      assignedServices: { some: { serviceId } },
    },
    select: { id: true, workDays: true },
  });

  if (specialists.length === 0) {
    for (const d of dateParams) days[dateKey(d)] = false;
    return NextResponse.json({ ok: true, days });
  }

  const specialistIds = specialists.map((s) => s.id);
  const [customWorkDaysAll, timeOffsAll, appointmentsAll] = await Promise.all([
    prisma.specialistCustomWorkDay.findMany({
      where: { specialistId: { in: specialistIds }, date: { gte: rangeStart, lte: rangeEnd } },
      select: { specialistId: true, date: true, startTime: true, endTime: true },
    }),
    prisma.specialistTimeOff.findMany({
      where: { specialistId: { in: specialistIds }, date: { gte: rangeStart, lte: rangeEnd } },
      select: { specialistId: true, date: true, allDay: true, startTime: true, endTime: true },
    }),
    prisma.appointment.findMany({
      where: {
        specialistId: { in: specialistIds },
        deletedAt: null,
        status: { notIn: ["CANCELED", "NO_SHOW"] },
        startsAt: { lte: rangeEnd },
        endsAt: { gte: rangeStart },
      },
      select: { specialistId: true, startsAt: true, endsAt: true },
    }),
  ]);

  for (const d of dateParams) {
    let hasSlot = false;
    for (const specialist of specialists) {
      if (hasSlot) break;
      const customWorkDays = customWorkDaysAll.filter((c) => c.specialistId === specialist.id);
      const timeOffs = timeOffsAll.filter((t) => t.specialistId === specialist.id);
      const appointments = appointmentsAll.filter((a) => a.specialistId === specialist.id);
      const busyRanges = busyRangesForWarsawDay(appointments, d.year, d.month, d.day);
      const freeSlots = computeFreeSlots({
        ...d,
        durationMin: service.durationMin,
        workDays: specialist.workDays,
        customWorkDays,
        timeOffs,
        busyRanges,
        now,
      });
      if (freeSlots.length > 0) hasSlot = true;
    }
    days[dateKey(d)] = hasSlot;
  }

  return NextResponse.json({ ok: true, days });
}
