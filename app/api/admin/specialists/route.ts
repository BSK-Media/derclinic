import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole, scopedLocationWhere } from "@/lib/api-helpers";

const TIME_ZONE = "Europe/Warsaw";
const WARSAW_DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function getWarsawScheduleContext(now = new Date()) {
  const parts = Object.fromEntries(
    WARSAW_DATE_TIME_FORMATTER.formatToParts(now).map((part) => [part.type, part.value]),
  );
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const dateUtc = new Date(`${date}T00:00:00.000Z`);
  const weekday = (dateUtc.getUTCDay() + 6) % 7;
  const nextDateUtc = new Date(dateUtc);
  nextDateUtc.setUTCDate(nextDateUtc.getUTCDate() + 1);

  return {
    weekday,
    time: `${parts.hour}:${parts.minute}`,
    dateFrom: dateUtc,
    dateTo: nextDateUtc,
  };
}

export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const scheduleContext = getWarsawScheduleContext();
  const specialists = await prisma.user.findMany({
    where: { OR: [{ role: "SPECIALIST" }, { role: "RECEPTION" }], ...scopedLocationWhere(user!) },
    orderBy: [{ specialistCode: "asc" }, { name: "asc" }],
    select: {
      id: true,
      specialistCode: true,
      name: true,
      login: true,
      role: true,
      email: true,
      phone: true,
      isVisible: true,
      isAvailable: true,
      avatarUrl: true,
      jobTitle: true,
      location: true,
      locationId: true,
      assignedLocation: { select: { id: true, name: true } },
      specialization: true,
      sourceProfileUrl: true,
      createdAt: true,
      workDays: {
        where: { weekday: scheduleContext.weekday },
        select: { startTime: true, endTime: true },
      },
      customWorkDays: {
        where: { date: { gte: scheduleContext.dateFrom, lt: scheduleContext.dateTo } },
        select: { startTime: true, endTime: true },
      },
      timeOffs: {
        where: { date: { gte: scheduleContext.dateFrom, lt: scheduleContext.dateTo } },
        select: { allDay: true, startTime: true, endTime: true },
      },
    },
  });

  return NextResponse.json({
    ok: true,
    specialists: specialists.map((specialist) => {
      const { workDays, customWorkDays, timeOffs, ...profile } = specialist;
      const scheduledWork = customWorkDays[0] ?? workDays[0];
      const isWithinWorkingHours = Boolean(
        scheduledWork &&
          scheduleContext.time >= scheduledWork.startTime &&
          scheduleContext.time < scheduledWork.endTime,
      );
      const isDuringTimeOff = timeOffs.some(
        (timeOff) =>
          timeOff.allDay ||
          Boolean(
            timeOff.startTime &&
              timeOff.endTime &&
              scheduleContext.time >= timeOff.startTime &&
              scheduleContext.time < timeOff.endTime,
          ),
      );

      return {
        ...profile,
        location: specialist.assignedLocation.name,
        isAvailable:
          specialist.role === "SPECIALIST"
            ? isWithinWorkingHours && !isDuringTimeOff
            : specialist.isAvailable,
      };
    }),
  });
}
