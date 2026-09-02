import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseDateInput, warsawWallTimeToUtc } from "@/lib/warsaw-time";
import { busyRangesForWarsawDay, computeFreeSlots } from "@/lib/public-booking";

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const specialistId = url.searchParams.get("specialistId") ?? "";
  const serviceId = url.searchParams.get("serviceId") ?? "";
  const dateParam = parseDateInput(url.searchParams.get("date"));

  if (!specialistId || !serviceId) return bad("Brak specjalisty lub usługi");
  if (!dateParam) return bad("Nieprawidłowa data");

  const [specialist, service] = await Promise.all([
    prisma.user.findFirst({
      where: { id: specialistId, role: "SPECIALIST", isVisible: true },
      select: {
        id: true,
        workDays: true,
        assignedServices: { select: { serviceId: true } },
      },
    }),
    prisma.service.findUnique({
      where: { id: serviceId },
      select: { id: true, durationMin: true },
    }),
  ]);

  if (!specialist) return bad("Nie znaleziono specjalisty", 404);
  if (!service) return bad("Nie znaleziono usługi", 404);
  const offersService = specialist.assignedServices.some((a) => a.serviceId === serviceId);
  if (!offersService) return bad("Ten specjalista nie wykonuje wybranej usługi");

  const dayStart = warsawWallTimeToUtc({ ...dateParam, hour: 0, minute: 0 });
  const dayEnd = warsawWallTimeToUtc({ ...dateParam, hour: 23, minute: 59 });
  // Bierzemy trochę szerszy zakres UTC, żeby nie zgubić wizyt przy zmianie doby na granicy stref.
  const rangeStart = new Date(dayStart.getTime() - 4 * 60 * 60 * 1000);
  const rangeEnd = new Date(dayEnd.getTime() + 4 * 60 * 60 * 1000);

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

  const busyRanges = busyRangesForWarsawDay(appointments, dateParam.year, dateParam.month, dateParam.day);

  const slots = computeFreeSlots({
    ...dateParam,
    durationMin: service.durationMin,
    workDays: specialist.workDays,
    customWorkDays,
    timeOffs,
    busyRanges,
    now: new Date(),
  });

  return NextResponse.json({ ok: true, slots, durationMin: service.durationMin });
}
