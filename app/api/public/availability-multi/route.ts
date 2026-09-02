import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseDateInput, warsawWallTimeToUtc } from "@/lib/warsaw-time";
import { busyRangesForWarsawDay, computeFreeSlots } from "@/lib/public-booking";

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

// Zwraca wolne terminy zsumowane ze wszystkich specjalistów wykonujących dany
// zabieg w danej lokalizacji — dla klientów, którzy nie mają preferowanego
// specjalisty i chcą po prostu najbliższy wolny termin na dany zabieg.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const serviceId = url.searchParams.get("serviceId") ?? "";
  const locationId = url.searchParams.get("locationId") ?? "";
  const dateParam = parseDateInput(url.searchParams.get("date"));

  if (!serviceId) return bad("Brak wybranego zabiegu");
  if (!dateParam) return bad("Nieprawidłowa data");

  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    select: { id: true, durationMin: true },
  });
  if (!service) return bad("Nie znaleziono usługi", 404);

  const specialists = await prisma.user.findMany({
    where: {
      role: "SPECIALIST",
      isVisible: true,
      ...(locationId ? { locationId } : {}),
      assignedServices: { some: { serviceId } },
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true, workDays: true },
  });

  if (specialists.length === 0) {
    return NextResponse.json({ ok: true, slots: [], durationMin: service.durationMin });
  }

  const dayStart = warsawWallTimeToUtc({ ...dateParam, hour: 0, minute: 0 });
  const dayEnd = warsawWallTimeToUtc({ ...dateParam, hour: 23, minute: 59 });
  const rangeStart = new Date(dayStart.getTime() - 4 * 60 * 60 * 1000);
  const rangeEnd = new Date(dayEnd.getTime() + 4 * 60 * 60 * 1000);
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

  const now = new Date();
  // Jeden termin -> jeden (pierwszy dostępny) specjalista, żeby klient nie musiał wybierać.
  const claimed = new Map<string, { specialistId: string; specialistName: string }>();

  for (const specialist of specialists) {
    const customWorkDays = customWorkDaysAll.filter((c) => c.specialistId === specialist.id);
    const timeOffs = timeOffsAll.filter((t) => t.specialistId === specialist.id);
    const appointments = appointmentsAll.filter((a) => a.specialistId === specialist.id);
    const busyRanges = busyRangesForWarsawDay(appointments, dateParam.year, dateParam.month, dateParam.day);

    const freeSlots = computeFreeSlots({
      ...dateParam,
      durationMin: service.durationMin,
      workDays: specialist.workDays,
      customWorkDays,
      timeOffs,
      busyRanges,
      now,
    });

    for (const time of freeSlots) {
      if (!claimed.has(time)) {
        claimed.set(time, { specialistId: specialist.id, specialistName: specialist.name });
      }
    }
  }

  const slots = [...claimed.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([time, who]) => ({ time, specialistId: who.specialistId, specialistName: who.specialistName }));

  return NextResponse.json({ ok: true, slots, durationMin: service.durationMin });
}
