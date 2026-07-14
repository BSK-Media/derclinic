import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/api-helpers";

type RangeKey = "today" | "7d" | "30d" | "custom";
type DateParts = { year: number; month: number; day: number };

const WARSAW_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Warsaw",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function warsawParts(date = new Date()) {
  const parts = Object.fromEntries(
    WARSAW_FORMATTER.formatToParts(date).map((part) => [part.type, part.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function warsawMidnightToUtc({ year, month, day }: DateParts) {
  const targetAsUtc = Date.UTC(year, month - 1, day, 0, 0, 0);
  let guess = targetAsUtc;

  // Dwie iteracje uwzględniają zmianę czasu zimowego/letniego.
  for (let i = 0; i < 2; i += 1) {
    const current = warsawParts(new Date(guess));
    const currentAsUtc = Date.UTC(
      current.year,
      current.month - 1,
      current.day,
      current.hour,
      current.minute,
      current.second,
    );
    guess += targetAsUtc - currentAsUtc;
  }

  return new Date(guess);
}

function addDays(parts: DateParts, days: number): DateParts {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function parseDate(value: string | null): DateParts | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const test = new Date(Date.UTC(year, month - 1, day));
  if (
    test.getUTCFullYear() !== year ||
    test.getUTCMonth() + 1 !== month ||
    test.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

function resolveRange(url: URL) {
  const rawRange = url.searchParams.get("range");
  const range: RangeKey =
    rawRange === "today" || rawRange === "7d" || rawRange === "custom"
      ? rawRange
      : "30d";
  const now = warsawParts();
  const today = { year: now.year, month: now.month, day: now.day };

  if (range === "today") {
    return {
      range,
      start: warsawMidnightToUtc(today),
      end: warsawMidnightToUtc(addDays(today, 1)),
    };
  }

  if (range === "7d") {
    return {
      range,
      start: warsawMidnightToUtc(addDays(today, -6)),
      end: warsawMidnightToUtc(addDays(today, 1)),
    };
  }

  if (range === "30d") {
    return {
      range,
      start: warsawMidnightToUtc(addDays(today, -29)),
      end: warsawMidnightToUtc(addDays(today, 1)),
    };
  }

  if (range === "custom") {
    const from = parseDate(url.searchParams.get("from"));
    const to = parseDate(url.searchParams.get("to"));
    if (!from || !to) return null;

    const start = warsawMidnightToUtc(from);
    const end = warsawMidnightToUtc(addDays(to, 1));
    if (start >= end) return null;
    return { range, start, end };
  }

  return null;
}

export async function GET(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const period = resolveRange(new URL(req.url));
  if (!period) {
    return NextResponse.json(
      { ok: false, message: "Niepoprawny zakres dat" },
      { status: 400 },
    );
  }

  const specialists = await prisma.user.findMany({
    where: { role: "SPECIALIST" },
    orderBy: [{ specialistCode: "asc" }, { name: "asc" }],
    select: {
      id: true,
      specialistCode: true,
      name: true,
      avatarUrl: true,
      jobTitle: true,
      baseRate: true,
    },
  });
  const specialistIds = specialists.map((specialist) => specialist.id);

  const [appointments, rates] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        specialistId: { in: specialistIds },
        status: "COMPLETED",
        startsAt: { gte: period.start, lt: period.end },
      },
      select: {
        id: true,
        specialistId: true,
        serviceId: true,
        priceEstimate: true,
        priceFinal: true,
        consumptions: {
          select: {
            quantity: true,
            product: { select: { purchasePrice: true } },
          },
        },
      },
      take: 10000,
    }),
    prisma.specialistServiceRate.findMany({
      where: { specialistId: { in: specialistIds } },
      select: { specialistId: true, serviceId: true, amount: true },
    }),
  ]);

  const ratesBySpecialistAndService = new Map(
    rates.map((rate) => [`${rate.specialistId}:${rate.serviceId}`, rate.amount]),
  );

  const rows = specialists.map((specialist) => {
    const completed = appointments.filter(
      (appointment) => appointment.specialistId === specialist.id,
    );
    let revenue = 0;
    let materialCost = 0;
    let payout = 0;
    let missingRateCount = 0;

    for (const appointment of completed) {
      const appointmentMaterials = appointment.consumptions.reduce((sum, consumption) => {
        const purchasePrice = consumption.product.purchasePrice ?? 0;
        const quantity = Math.abs(Number(consumption.quantity));
        return sum + Math.round(purchasePrice * quantity);
      }, 0);
      const rate =
        ratesBySpecialistAndService.get(`${specialist.id}:${appointment.serviceId}`) ??
        specialist.baseRate ??
        null;

      revenue += appointment.priceFinal ?? appointment.priceEstimate ?? 0;
      materialCost += appointmentMaterials;
      if (rate === null) {
        missingRateCount += 1;
      } else {
        payout += rate - appointmentMaterials;
      }
    }

    return {
      specialistId: specialist.id,
      specialistCode: specialist.specialistCode,
      name: specialist.name,
      avatarUrl: specialist.avatarUrl,
      jobTitle: specialist.jobTitle,
      revenue,
      materialCost,
      appointmentsCount: completed.length,
      payout,
      missingRateCount,
    };
  });

  return NextResponse.json({
    ok: true,
    range: period.range,
    start: period.start,
    end: period.end,
    rows,
  });
}
