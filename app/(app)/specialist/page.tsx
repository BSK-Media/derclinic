import type { ReactNode } from "react";
import type { Prisma } from "@prisma/client";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bell,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Clock3,
  PackageCheck,
  RefreshCcw,
  WalletCards,
  XCircle,
} from "lucide-react";
import { prisma } from "@/lib/db";
import { getEffectiveAuth } from "@/lib/effective-auth";
import { formatPLNFromGrosze } from "@/lib/money";
import { SpecialistDashboardRefresh } from "@/components/specialist-dashboard-refresh";

const TIME_ZONE = "Europe/Warsaw";
const WOS_WEEKS = 10;
const LOW_STOCK_DAYS = 14;
const SHORT_EXPIRY_MONTHS = 6;
const UPCOMING_VISITS_LIMIT = 7;

type DateParts = { year: number; month: number; day: number };
type NotificationKind = "new" | "changed" | "canceled" | "approved" | "rejected" | "message";

type NotificationItem = {
  id: string;
  kind: NotificationKind;
  title: string;
  description: string;
  createdAt: Date;
  appointmentId?: string;
};

type ProductAlert = {
  productId: string;
  productName: string;
  serviceName: string;
  appointmentDate: Date;
  quantity: number;
  coverageDays: number | null;
  nearestExpiry: Date | null;
  lowStock: boolean;
  shortExpiry: boolean;
};

const WARSAW_PARTS_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

const DATE_FORMATTER = new Intl.DateTimeFormat("pl-PL", {
  timeZone: TIME_ZONE,
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
});

const FULL_DATE_FORMATTER = new Intl.DateTimeFormat("pl-PL", {
  timeZone: TIME_ZONE,
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

const TIME_FORMATTER = new Intl.DateTimeFormat("pl-PL", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
});

function warsawParts(date = new Date()) {
  const parts = Object.fromEntries(
    WARSAW_PARTS_FORMATTER.formatToParts(date).map((part) => [part.type, part.value]),
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
  for (let index = 0; index < 2; index += 1) {
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
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function addMonths(parts: DateParts, months: number): DateParts {
  const date = new Date(Date.UTC(parts.year, parts.month - 1 + months, parts.day));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function serviceName(appointment: { customServiceName: string | null; service: { name: string } }) {
  return appointment.customServiceName || appointment.service.name;
}

function formatNotificationDate(date: Date, todayStart: Date, tomorrowStart: Date) {
  if (date >= todayStart && date < tomorrowStart) return `Dzisiaj, ${TIME_FORMATTER.format(date)}`;
  return `${DATE_FORMATTER.format(date)}, ${TIME_FORMATTER.format(date)}`;
}

function formatQuantity(value: number) {
  return value.toLocaleString("pl-PL", { maximumFractionDigits: 2 });
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function DashboardCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={`rounded-3xl border border-white/70 bg-white/80 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#0b1220]/60 ${className}`}
    >
      {children}
    </section>
  );
}

function MetricCard({
  title,
  value,
  description,
  icon,
  tone = "emerald",
  children,
}: {
  title: string;
  value: ReactNode;
  description?: string;
  icon: ReactNode;
  tone?: "emerald" | "blue" | "violet" | "amber";
  children?: ReactNode;
}) {
  const iconClass = {
    emerald: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
    blue: "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300",
    violet: "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300",
    amber: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
  }[tone];

  return (
    <DashboardCard className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-600 dark:text-slate-300">{title}</div>
          <div className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">
            {value}
          </div>
          {description ? (
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{description}</div>
          ) : null}
        </div>
        <div
          className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${iconClass}`}
        >
          {icon}
        </div>
      </div>
      {children}
    </DashboardCard>
  );
}

function VisitStatusPill({ status, approvalStatus }: { status: string; approvalStatus: string }) {
  if (status === "COMPLETED" && approvalStatus === "PENDING") {
    return (
      <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
        Oczekuje na akceptację
      </span>
    );
  }
  return (
    <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">
      Nadchodząca
    </span>
  );
}

function NotificationIcon({ kind }: { kind: NotificationKind }) {
  if (kind === "canceled" || kind === "rejected")
    return <XCircle className="h-4 w-4 text-red-600" />;
  if (kind === "approved") return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  if (kind === "changed") return <RefreshCcw className="h-4 w-4 text-amber-600" />;
  if (kind === "message") return <Bell className="h-4 w-4 text-violet-600" />;
  return <CalendarDays className="h-4 w-4 text-sky-600" />;
}

export default async function SpecialistHome() {
  const { user: auth } = await getEffectiveAuth();
  if (!auth || auth.role !== "SPECIALIST") return null;

  const now = new Date();
  const currentWarsaw = warsawParts(now);
  const today = { year: currentWarsaw.year, month: currentWarsaw.month, day: currentWarsaw.day };
  const todayStart = warsawMidnightToUtc(today);
  const tomorrowStart = warsawMidnightToUtc(addDays(today, 1));
  const monthStart = warsawMidnightToUtc({ year: today.year, month: today.month, day: 1 });
  const nextMonthStart = warsawMidnightToUtc(
    addMonths({ year: today.year, month: today.month, day: 1 }, 1),
  );
  const warningWindowEnd = warsawMidnightToUtc(addDays(today, 30));
  const tenWeeksAgo = new Date(now.getTime() - WOS_WEEKS * 7 * 24 * 60 * 60 * 1000);
  const notificationsFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const shortExpiryLimit = new Date(now);
  shortExpiryLimit.setMonth(shortExpiryLimit.getMonth() + SHORT_EXPIRY_MONTHS);

  const [
    specialist,
    todaysAppointments,
    monthlyCompleted,
    monthlyProceduresCount,
    overdueCount,
    upcomingAppointments,
    recentAppointments,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: auth.id },
      select: {
        id: true,
        name: true,
        payoutPercent: true,
        warehouseAssignments: { select: { warehouseId: true } },
      },
    }),
    prisma.appointment.findMany({
      where: {
        specialistId: auth.id,
        deletedAt: null,
        startsAt: { gte: todayStart, lt: tomorrowStart },
      },
      orderBy: { startsAt: "asc" },
      include: { patient: true, service: true },
    }),
    prisma.appointment.findMany({
      where: {
        specialistId: auth.id,
        status: "COMPLETED",
        approvalStatus: "APPROVED",
        deletedAt: null,
        startsAt: { gte: monthStart, lt: nextMonthStart },
      },
      select: {
        priceFinal: true,
        priceEstimate: true,
        consumptions: {
          where: { status: "APPLIED" },
          select: { quantity: true, product: { select: { purchasePrice: true } } },
        },
      },
    }),
    prisma.appointment.count({
      where: {
        specialistId: auth.id,
        status: "COMPLETED",
        deletedAt: null,
        startsAt: { gte: monthStart, lt: nextMonthStart },
      },
    }),
    prisma.appointment.count({
      where: {
        specialistId: auth.id,
        status: "SCHEDULED",
        approvalStatus: { not: "REJECTED" },
        deletedAt: null,
        startsAt: { lte: now },
      },
    }),
    prisma.appointment.findMany({
      where: {
        specialistId: auth.id,
        status: "SCHEDULED",
        approvalStatus: { not: "REJECTED" },
        deletedAt: null,
        startsAt: { gt: now, lt: warningWindowEnd },
      },
      orderBy: { startsAt: "asc" },
      take: 50,
      include: {
        patient: true,
        service: {
          include: {
            suggestedProducts: { include: { product: { select: { id: true, name: true } } } },
          },
        },
      },
    }),
    prisma.appointment.findMany({
      where: {
        specialistId: auth.id,
        deletedAt: null,
        OR: [{ createdAt: { gte: notificationsFrom } }, { updatedAt: { gte: notificationsFrom } }],
      },
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        startsAt: true,
        status: true,
        approvalStatus: true,
        customServiceName: true,
        patient: { select: { name: true } },
        service: { select: { name: true } },
      },
    }),
  ]);

  if (!specialist) return null;

  const completedToday = todaysAppointments.filter(
    (appointment) => appointment.status === "COMPLETED",
  ).length;
  const upcomingToday = todaysAppointments.filter(
    (appointment) =>
      appointment.status === "SCHEDULED" &&
      appointment.approvalStatus !== "REJECTED" &&
      appointment.startsAt > now,
  ).length;
  const awaitingToday = todaysAppointments.filter(
    (appointment) =>
      appointment.status === "SCHEDULED" &&
      appointment.approvalStatus !== "REJECTED" &&
      appointment.startsAt <= now,
  ).length;
  const canceledToday = todaysAppointments.filter(
    (appointment) => appointment.status === "CANCELED" || appointment.approvalStatus === "REJECTED",
  ).length;

  const monthlyEarnings = monthlyCompleted.reduce((sum, appointment) => {
    const revenue = appointment.priceFinal ?? appointment.priceEstimate ?? 0;
    const materials = appointment.consumptions.reduce((materialSum, consumption) => {
      const purchasePrice = consumption.product.purchasePrice ?? 0;
      return materialSum + Math.round(purchasePrice * Math.abs(Number(consumption.quantity)));
    }, 0);
    return sum + Math.round(((revenue - materials) * specialist.payoutPercent) / 100);
  }, 0);

  const nearestAppointment = upcomingAppointments[0] ?? null;
  const schedule = upcomingAppointments.slice(0, UPCOMING_VISITS_LIMIT);

  const recentAppointmentById = new Map(
    recentAppointments.map((appointment) => [appointment.id, appointment]),
  );
  const auditConditions: Prisma.AuditLogWhereInput[] = [
    { entity: "SpecialistMessage", entityId: auth.id },
  ];
  if (recentAppointments.length > 0) {
    auditConditions.push({
      entity: { in: ["Appointment", "AppointmentApproval"] },
      entityId: { in: recentAppointments.map((appointment) => appointment.id) },
    });
  }

  const auditLogs = await prisma.auditLog.findMany({
    where: {
      createdAt: { gte: notificationsFrom },
      actorId: { not: auth.id },
      OR: auditConditions,
    },
    include: { actor: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  const notifications: NotificationItem[] = [];
  for (const log of auditLogs) {
    if (notifications.length >= 6) break;
    const data =
      log.data && typeof log.data === "object" && !Array.isArray(log.data)
        ? (log.data as Record<string, unknown>)
        : {};

    if (log.entity === "SpecialistMessage") {
      notifications.push({
        id: log.id,
        kind: "message",
        title: `Wiadomość od ${log.actor.name}`,
        description:
          typeof data.message === "string" ? data.message : "Nowa wiadomość od administratora.",
        createdAt: log.createdAt,
      });
      continue;
    }

    const appointment = log.entityId ? recentAppointmentById.get(log.entityId) : null;
    if (!appointment) continue;
    const patientAndService = `${appointment.patient.name} • ${serviceName(appointment)}`;

    if (log.entity === "AppointmentApproval") {
      const approved = data.approvalStatus === "APPROVED";
      notifications.push({
        id: log.id,
        kind: approved ? "approved" : "rejected",
        title: approved ? "Wizyta została zatwierdzona" : "Wizyta została odrzucona",
        description: patientAndService,
        createdAt: log.createdAt,
        appointmentId: appointment.id,
      });
    } else if (log.action === "CREATE") {
      notifications.push({
        id: log.id,
        kind: "new",
        title: "Dodano nową wizytę",
        description: `${DATE_FORMATTER.format(appointment.startsAt)}, ${TIME_FORMATTER.format(appointment.startsAt)} • ${patientAndService}`,
        createdAt: log.createdAt,
        appointmentId: appointment.id,
      });
    } else if (data.status === "CANCELED") {
      notifications.push({
        id: log.id,
        kind: "canceled",
        title: "Wizyta została odwołana",
        description: patientAndService,
        createdAt: log.createdAt,
        appointmentId: appointment.id,
      });
    } else if (typeof data.startsAt === "string" || typeof data.endsAt === "string") {
      notifications.push({
        id: log.id,
        kind: "changed",
        title: "Zmieniono termin wizyty",
        description: `${DATE_FORMATTER.format(appointment.startsAt)}, ${TIME_FORMATTER.format(appointment.startsAt)} • ${patientAndService}`,
        createdAt: log.createdAt,
        appointmentId: appointment.id,
      });
    } else if (typeof data.note === "string" && data.note.trim()) {
      notifications.push({
        id: log.id,
        kind: "message",
        title: `Wiadomość od ${log.actor.name}`,
        description: data.note.trim(),
        createdAt: log.createdAt,
        appointmentId: appointment.id,
      });
    }
  }

  if (notifications.length === 0) {
    for (const appointment of [...recentAppointments]
      .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())
      .slice(0, 4)) {
      const canceled =
        appointment.status === "CANCELED" || appointment.approvalStatus === "REJECTED";
      notifications.push({
        id: `appointment-${appointment.id}`,
        kind: canceled ? "canceled" : "new",
        title: canceled ? "Wizyta została odwołana" : "Dodano wizytę do grafiku",
        description: `${DATE_FORMATTER.format(appointment.startsAt)}, ${TIME_FORMATTER.format(appointment.startsAt)} • ${appointment.patient.name}`,
        createdAt: appointment.updatedAt,
        appointmentId: appointment.id,
      });
    }
  }

  const neededProductById = new Map<
    string,
    { productName: string; serviceName: string; appointmentDate: Date }
  >();
  for (const appointment of upcomingAppointments) {
    for (const suggestion of appointment.service.suggestedProducts) {
      if (!neededProductById.has(suggestion.productId)) {
        neededProductById.set(suggestion.productId, {
          productName: suggestion.product.name,
          serviceName: serviceName(appointment),
          appointmentDate: appointment.startsAt,
        });
      }
    }
  }

  const neededProductIds = Array.from(neededProductById.keys());
  let warehouseIds = specialist.warehouseAssignments.map((assignment) => assignment.warehouseId);
  if (warehouseIds.length === 0 && neededProductIds.length > 0) {
    const warehouses = await prisma.warehouse.findMany({ select: { id: true } });
    warehouseIds = warehouses.map((warehouse) => warehouse.id);
  }

  let productAlerts: ProductAlert[] = [];
  if (neededProductIds.length > 0 && warehouseIds.length > 0) {
    const [stocks, lots, consumptions] = await Promise.all([
      prisma.stock.findMany({
        where: { productId: { in: neededProductIds }, warehouseId: { in: warehouseIds } },
        select: { productId: true, quantity: true },
      }),
      prisma.productLot.findMany({
        where: {
          productId: { in: neededProductIds },
          warehouseId: { in: warehouseIds },
          quantity: { gt: 0 },
          expiryDate: { not: null },
        },
        select: { productId: true, expiryDate: true },
        orderBy: { expiryDate: "asc" },
      }),
      prisma.consumption.findMany({
        where: {
          productId: { in: neededProductIds },
          warehouseId: { in: warehouseIds },
          createdAt: { gte: tenWeeksAgo },
          kind: { in: ["APPOINTMENT", "SALE"] },
          status: "APPLIED",
        },
        select: { productId: true, quantity: true },
      }),
    ]);

    const quantityByProduct = new Map<string, number>();
    for (const stock of stocks) {
      quantityByProduct.set(
        stock.productId,
        (quantityByProduct.get(stock.productId) ?? 0) + Number(stock.quantity),
      );
    }
    const usedByProduct = new Map<string, number>();
    for (const consumption of consumptions) {
      usedByProduct.set(
        consumption.productId,
        (usedByProduct.get(consumption.productId) ?? 0) + Math.abs(Number(consumption.quantity)),
      );
    }
    const nearestExpiryByProduct = new Map<string, Date>();
    for (const lot of lots) {
      if (lot.expiryDate && !nearestExpiryByProduct.has(lot.productId)) {
        nearestExpiryByProduct.set(lot.productId, lot.expiryDate);
      }
    }

    productAlerts = neededProductIds
      .map((productId) => {
        const needed = neededProductById.get(productId)!;
        const quantity = quantityByProduct.get(productId) ?? 0;
        const weeklyUsage = (usedByProduct.get(productId) ?? 0) / WOS_WEEKS;
        const coverageDays = weeklyUsage > 0 ? (quantity / weeklyUsage) * 7 : null;
        const nearestExpiry = nearestExpiryByProduct.get(productId) ?? null;
        return {
          productId,
          ...needed,
          quantity,
          coverageDays,
          nearestExpiry,
          lowStock: quantity <= 0 || (coverageDays !== null && coverageDays < LOW_STOCK_DAYS),
          shortExpiry: nearestExpiry !== null && nearestExpiry <= shortExpiryLimit,
        };
      })
      .filter((alert) => alert.lowStock || alert.shortExpiry)
      .sort((left, right) => left.appointmentDate.getTime() - right.appointmentDate.getTime());
  }

  const firstName = specialist.name.split(/\s+/)[0] || specialist.name;

  return (
    <div className="space-y-6">
      <SpecialistDashboardRefresh />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-sm font-medium capitalize text-emerald-700 dark:text-emerald-300">
            {FULL_DATE_FORMATTER.format(now)}
          </div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">
            Dzień dobry, {firstName}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Najważniejsze informacje o Twoim dniu pracy.
          </p>
        </div>
        <Link
          href="/specialist/appointments"
          className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
        >
          Przejdź do wizyt <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Dzisiejsze wizyty"
          value={todaysAppointments.length}
          description="Wszystkie wizyty zaplanowane na dzisiaj"
          icon={<CalendarDays className="h-5 w-5" />}
        >
          <div className="mt-4 grid grid-cols-4 gap-1 border-t border-slate-100 pt-4 text-center dark:border-white/10">
            <div>
              <div className="text-lg font-semibold text-emerald-700">{completedToday}</div>
              <div className="text-[10px] text-slate-500">Zakończone</div>
            </div>
            <div>
              <div className="text-lg font-semibold text-sky-700">{upcomingToday}</div>
              <div className="text-[10px] text-slate-500">Nadchodzące</div>
            </div>
            <div>
              <div className="text-lg font-semibold text-amber-600">{awaitingToday}</div>
              <div className="text-[10px] text-slate-500">Oczekujące</div>
            </div>
            <div>
              <div className="text-lg font-semibold text-red-600">{canceledToday}</div>
              <div className="text-[10px] text-slate-500">Odwołane</div>
            </div>
          </div>
        </MetricCard>

        <MetricCard
          title="Oczekujące"
          value={overdueCount}
          description="Wizyty wymagające ustawienia statusu"
          icon={<Clock3 className="h-5 w-5" />}
          tone="amber"
        >
          <div className="mt-4 border-t border-slate-100 pt-4 dark:border-white/10">
            <Link
              href="/specialist/appointments"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 hover:underline dark:text-amber-300"
            >
              {overdueCount > 0 ? "Uzupełnij status wizyt" : "Brak wizyt do uzupełnienia"}
              {overdueCount > 0 ? (
                <ArrowRight className="h-3.5 w-3.5" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
            </Link>
          </div>
        </MetricCard>

        <MetricCard
          title="Wynagrodzenie w tym miesiącu"
          value={formatPLNFromGrosze(monthlyEarnings)}
          description={`Naliczono z ${monthlyCompleted.length} zatwierdzonych wizyt`}
          icon={<WalletCards className="h-5 w-5" />}
          tone="violet"
        >
          <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-4 text-xs text-slate-500 dark:border-white/10">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Tylko zakończone i zaakceptowane
            wizyty
          </div>
        </MetricCard>

        <MetricCard
          title="Wykonane zabiegi"
          value={monthlyProceduresCount}
          description="Łącznie w obecnym miesiącu"
          icon={<Activity className="h-5 w-5" />}
          tone="blue"
        >
          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4 dark:border-white/10">
            <span className="text-xs text-slate-500">Dzisiaj</span>
            <span className="text-sm font-semibold text-slate-900 dark:text-white">
              {completedToday}
            </span>
          </div>
        </MetricCard>
      </div>

      <DashboardCard className="overflow-hidden">
        <div className="grid lg:grid-cols-[1fr_auto]">
          <div className="p-6">
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
              <CalendarClock className="h-4 w-4" /> Najbliższa wizyta
            </div>
            {nearestAppointment ? (
              <div className="mt-5 grid gap-5 sm:grid-cols-3">
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    Termin
                  </div>
                  <div className="mt-1 text-2xl font-semibold text-slate-950 dark:text-white">
                    {TIME_FORMATTER.format(nearestAppointment.startsAt)}
                  </div>
                  <div className="mt-1 text-sm capitalize text-slate-500">
                    {DATE_FORMATTER.format(nearestAppointment.startsAt)}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    Pacjent
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-700 dark:bg-white/10 dark:text-slate-200">
                      {initials(nearestAppointment.patient.name)}
                    </div>
                    <div className="font-semibold text-slate-900 dark:text-white">
                      {nearestAppointment.patient.name}
                    </div>
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    Zabieg
                  </div>
                  <div className="mt-2 font-semibold text-slate-900 dark:text-white">
                    {serviceName(nearestAppointment)}
                  </div>
                  <div className="mt-2">
                    <VisitStatusPill
                      status={nearestAppointment.status}
                      approvalStatus={nearestAppointment.approvalStatus}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-5 rounded-2xl bg-slate-50 px-4 py-6 text-sm text-slate-500 dark:bg-white/5">
                Brak kolejnych zaplanowanych wizyt w najbliższych 30 dniach.
              </div>
            )}
          </div>
          {nearestAppointment ? (
            <Link
              href={`/specialist/appointments/${nearestAppointment.id}`}
              className="flex min-h-20 items-center justify-center gap-2 border-t border-slate-100 bg-emerald-50 px-7 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100 dark:border-white/10 dark:bg-emerald-500/10 dark:text-emerald-200 lg:border-l lg:border-t-0"
            >
              Otwórz wizytę <ArrowRight className="h-4 w-4" />
            </Link>
          ) : null}
        </div>
      </DashboardCard>

      <div className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
        <DashboardCard className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-white/10">
            <div>
              <h2 className="font-semibold text-slate-950 dark:text-white">Najbliższy grafik</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Kolejne {UPCOMING_VISITS_LIMIT} zaplanowanych wizyt
              </p>
            </div>
            <Link
              href="/specialist/appointments?view=calendar"
              className="text-xs font-semibold text-emerald-700 hover:underline"
            >
              Pełny kalendarz
            </Link>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-white/10">
            {schedule.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-slate-500">
                Brak zaplanowanych wizyt.
              </div>
            ) : null}
            {schedule.map((appointment) => (
              <Link
                key={appointment.id}
                href={`/specialist/appointments/${appointment.id}`}
                className="grid gap-3 px-5 py-4 transition hover:bg-slate-50/80 dark:hover:bg-white/5 sm:grid-cols-[78px_1fr_auto] sm:items-center"
              >
                <div>
                  <div className="text-lg font-semibold text-slate-950 dark:text-white">
                    {TIME_FORMATTER.format(appointment.startsAt)}
                  </div>
                  <div className="text-xs capitalize text-slate-500">
                    {DATE_FORMATTER.format(appointment.startsAt)}
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="truncate font-semibold text-slate-900 dark:text-white">
                    {appointment.patient.name}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-slate-500">
                    {serviceName(appointment)}
                  </div>
                </div>
                <VisitStatusPill
                  status={appointment.status}
                  approvalStatus={appointment.approvalStatus}
                />
              </Link>
            ))}
          </div>
        </DashboardCard>

        <DashboardCard className="overflow-hidden">
          <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4 dark:border-white/10">
            <div className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-violet-50 text-violet-700">
              <Bell className="h-4 w-4" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-950 dark:text-white">Powiadomienia</h2>
              <p className="mt-0.5 text-xs text-slate-500">Zmiany z ostatnich 30 dni</p>
            </div>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-white/10">
            {notifications.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-slate-500">
                Brak nowych powiadomień.
              </div>
            ) : null}
            {notifications.map((notification) => {
              const content = (
                <div className="flex gap-3 px-5 py-4 transition hover:bg-slate-50/80 dark:hover:bg-white/5">
                  <div className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-slate-50 dark:bg-white/5">
                    <NotificationIcon kind={notification.kind} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900 dark:text-white">
                      {notification.title}
                    </div>
                    <div className="mt-0.5 line-clamp-2 text-xs text-slate-500">
                      {notification.description}
                    </div>
                    <div className="mt-1.5 text-[11px] text-slate-400">
                      {formatNotificationDate(notification.createdAt, todayStart, tomorrowStart)}
                    </div>
                  </div>
                </div>
              );
              return notification.appointmentId ? (
                <Link
                  key={notification.id}
                  href={`/specialist/appointments/${notification.appointmentId}`}
                >
                  {content}
                </Link>
              ) : (
                <div key={notification.id}>{content}</div>
              );
            })}
          </div>
        </DashboardCard>
      </div>

      <DashboardCard className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-white/10">
          <div className="flex items-center gap-3">
            <div
              className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl ${productAlerts.length > 0 ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}
            >
              {productAlerts.length > 0 ? (
                <AlertTriangle className="h-5 w-5" />
              ) : (
                <PackageCheck className="h-5 w-5" />
              )}
            </div>
            <div>
              <h2 className="font-semibold text-slate-950 dark:text-white">
                Preparaty do zaplanowanych zabiegów
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Kontrola dostępności i terminu na najbliższe 30 dni
              </p>
            </div>
          </div>
          {productAlerts.length > 0 ? (
            <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
              {productAlerts.length} {productAlerts.length === 1 ? "ostrzeżenie" : "ostrzeżenia"}
            </span>
          ) : null}
        </div>

        {productAlerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-5 py-10 text-center">
            <PackageCheck className="h-9 w-9 text-emerald-500" />
            <div className="mt-3 font-semibold text-slate-900 dark:text-white">
              Wszystkie potrzebne preparaty są dostępne
            </div>
            <div className="mt-1 max-w-xl text-sm text-slate-500">
              Brak niskich stanów i krótkich terminów dla preparatów przypisanych do nadchodzących
              zabiegów.
            </div>
          </div>
        ) : (
          <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
            {productAlerts.map((alert) => (
              <div
                key={alert.productId}
                className="rounded-2xl border border-amber-200/70 bg-amber-50/50 p-4 dark:border-amber-500/20 dark:bg-amber-500/5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-white">
                      {alert.productName}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      Potrzebny do: {alert.serviceName}
                    </div>
                  </div>
                  <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {alert.lowStock ? (
                    <span className="rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-semibold text-red-700">
                      {alert.quantity <= 0
                        ? "Brak w magazynie"
                        : `Niski stan: ${formatQuantity(alert.quantity)} • ${Math.max(0, Math.floor(alert.coverageDays ?? 0))} dni`}
                    </span>
                  ) : null}
                  {alert.shortExpiry && alert.nearestExpiry ? (
                    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800">
                      Termin:{" "}
                      {alert.nearestExpiry.toLocaleDateString("pl-PL", { timeZone: TIME_ZONE })}
                    </span>
                  ) : null}
                </div>
                <div className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-500">
                  <Clock3 className="h-3.5 w-3.5" /> Najbliższy zabieg:{" "}
                  {DATE_FORMATTER.format(alert.appointmentDate)},{" "}
                  {TIME_FORMATTER.format(alert.appointmentDate)}
                </div>
              </div>
            ))}
          </div>
        )}
      </DashboardCard>
    </div>
  );
}
