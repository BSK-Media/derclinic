import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

const WorkDaysSchema = z.object({
  workDays: z
    .array(
      z.object({
        weekday: z.number().int().min(0).max(6),
        startTime: z.string().regex(TIME_REGEX, "Niepoprawna godzina rozpoczęcia"),
        endTime: z.string().regex(TIME_REGEX, "Niepoprawna godzina zakończenia"),
      }),
    )
    .max(7),
});

const TimeOffSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Niepoprawna data"),
  allDay: z.boolean(),
  startTime: z.string().regex(TIME_REGEX).optional().nullable(),
  endTime: z.string().regex(TIME_REGEX).optional().nullable(),
  note: z.string().trim().max(300).optional().nullable(),
});

async function ensureSpecialist(id: string) {
  const specialist = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true, name: true },
  });
  if (!specialist || specialist.role !== "SPECIALIST") return null;
  return specialist;
}

// GET — wzorzec tygodniowy + lista wolnych (opcjonalnie zawężona zakresem dat)
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN", "RECEPTION"]);
  if (deny) return deny;

  const specialist = await ensureSpecialist(params.id);
  if (!specialist) {
    return NextResponse.json({ ok: false, message: "Nie znaleziono specjalisty" }, { status: 404 });
  }

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const dateFilter =
    from && to
      ? { gte: new Date(`${from}T00:00:00`), lte: new Date(`${to}T23:59:59`) }
      : undefined;

  const [workDays, timeOffs] = await Promise.all([
    prisma.specialistWorkDay.findMany({
      where: { specialistId: params.id },
      orderBy: { weekday: "asc" },
    }),
    prisma.specialistTimeOff.findMany({
      where: { specialistId: params.id, ...(dateFilter ? { date: dateFilter } : {}) },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    }),
  ]);

  return NextResponse.json({ ok: true, workDays, timeOffs });
}

// PUT — zapis tygodniowego wzorca pracy (zastępuje poprzedni w całości)
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN", "RECEPTION"]);
  if (deny) return deny;

  const specialist = await ensureSpecialist(params.id);
  if (!specialist) {
    return NextResponse.json({ ok: false, message: "Nie znaleziono specjalisty" }, { status: 404 });
  }

  const json = await req.json().catch(() => null);
  const parsed = WorkDaysSchema.safeParse(json);
  if (!parsed.success)
    return NextResponse.json({ ok: false, message: "Niepoprawne dane" }, { status: 400 });

  const weekdays = new Set<number>();
  for (const day of parsed.data.workDays) {
    if (weekdays.has(day.weekday)) {
      return NextResponse.json(
        { ok: false, message: "Każdy dzień tygodnia może wystąpić tylko raz" },
        { status: 400 },
      );
    }
    weekdays.add(day.weekday);
    if (day.endTime <= day.startTime) {
      return NextResponse.json(
        { ok: false, message: "Godzina zakończenia musi być późniejsza niż rozpoczęcia" },
        { status: 400 },
      );
    }
  }

  await prisma.$transaction([
    prisma.specialistWorkDay.deleteMany({ where: { specialistId: params.id } }),
    prisma.specialistWorkDay.createMany({
      data: parsed.data.workDays.map((day) => ({
        specialistId: params.id,
        weekday: day.weekday,
        startTime: day.startTime,
        endTime: day.endTime,
      })),
    }),
  ]);

  await logAudit({
    actorId: user!.id,
    action: "UPDATE",
    entity: "SpecialistWorkDay",
    entityId: params.id,
    data: { workDays: parsed.data.workDays },
  });

  const workDays = await prisma.specialistWorkDay.findMany({
    where: { specialistId: params.id },
    orderBy: { weekday: "asc" },
  });

  return NextResponse.json({ ok: true, workDays });
}

// POST — dodanie dnia wolnego (cały dzień) lub wolnych godzin
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN", "RECEPTION"]);
  if (deny) return deny;

  const specialist = await ensureSpecialist(params.id);
  if (!specialist) {
    return NextResponse.json({ ok: false, message: "Nie znaleziono specjalisty" }, { status: 404 });
  }

  const json = await req.json().catch(() => null);
  const parsed = TimeOffSchema.safeParse(json);
  if (!parsed.success)
    return NextResponse.json({ ok: false, message: "Niepoprawne dane" }, { status: 400 });

  if (!parsed.data.allDay) {
    if (!parsed.data.startTime || !parsed.data.endTime) {
      return NextResponse.json(
        { ok: false, message: "Dla wolnych godzin podaj godzinę od i do" },
        { status: 400 },
      );
    }
    if (parsed.data.endTime <= parsed.data.startTime) {
      return NextResponse.json(
        { ok: false, message: "Godzina zakończenia musi być późniejsza niż rozpoczęcia" },
        { status: 400 },
      );
    }
  }

  const timeOff = await prisma.specialistTimeOff.create({
    data: {
      specialistId: params.id,
      date: new Date(`${parsed.data.date}T00:00:00`),
      allDay: parsed.data.allDay,
      startTime: parsed.data.allDay ? null : parsed.data.startTime,
      endTime: parsed.data.allDay ? null : parsed.data.endTime,
      note: parsed.data.note || null,
    },
  });

  await logAudit({
    actorId: user!.id,
    action: "CREATE",
    entity: "SpecialistTimeOff",
    entityId: timeOff.id,
    data: { specialistId: params.id, ...parsed.data },
  });

  return NextResponse.json({ ok: true, timeOff });
}

// DELETE — usunięcie wpisu wolnego (?timeOffId=...)
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN", "RECEPTION"]);
  if (deny) return deny;

  const url = new URL(req.url);
  const timeOffId = url.searchParams.get("timeOffId");
  if (!timeOffId) {
    return NextResponse.json({ ok: false, message: "Brak identyfikatora wpisu" }, { status: 400 });
  }

  const timeOff = await prisma.specialistTimeOff.findUnique({ where: { id: timeOffId } });
  if (!timeOff || timeOff.specialistId !== params.id) {
    return NextResponse.json({ ok: false, message: "Nie znaleziono wpisu" }, { status: 404 });
  }

  await prisma.specialistTimeOff.delete({ where: { id: timeOffId } });

  await logAudit({
    actorId: user!.id,
    action: "DELETE",
    entity: "SpecialistTimeOff",
    entityId: timeOffId,
    data: { specialistId: params.id, date: timeOff.date, allDay: timeOff.allDay },
  });

  return NextResponse.json({ ok: true });
}
