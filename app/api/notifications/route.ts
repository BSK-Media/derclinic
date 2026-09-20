import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/api-helpers";
import { resolveStaffNames } from "@/lib/audit";

const TIME_ZONE = "Europe/Warsaw";
const NOTIFICATIONS_DAYS = 30;
const NOTIFICATIONS_LIMIT = 6;

type NotificationKind = "new" | "changed" | "canceled" | "approved" | "rejected" | "message";

type NotificationItem = {
  id: string;
  kind: NotificationKind;
  title: string;
  description: string;
  createdAt: Date;
  appointmentId?: string;
  href?: string;
};

const DATA_CHANGE_FIELD_LABELS: Record<string, string> = {
  NAME: "Imię i nazwisko",
  PHONE: "Telefon",
  EMAIL: "E-mail",
};

const DATE_FORMATTER = new Intl.DateTimeFormat("pl-PL", {
  timeZone: TIME_ZONE,
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
});

const TIME_FORMATTER = new Intl.DateTimeFormat("pl-PL", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
});

const MarkReadSchema = z.object({
  notificationId: z.string().min(1).max(200),
  read: z.boolean().optional().default(true),
});

function serviceName(appointment: { customServiceName: string | null; service: { name: string } }) {
  return appointment.customServiceName || appointment.service.name;
}

// Powiadomienia dla recepcji/admina — na razie tylko oczekujące prośby
// pacjentów o zmianę danych kontaktowych (patrz PatientDataChangeRequest).
async function getAdminNotifications(): Promise<NotificationItem[]> {
  const pending = await prisma.patientDataChangeRequest.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "desc" },
    take: NOTIFICATIONS_LIMIT,
    include: { patient: { select: { name: true } } },
  });

  return pending.map((request) => ({
    id: `data-change-${request.id}`,
    kind: "message",
    title: "Prośba o zmianę danych",
    description: `${request.patient.name} — ${DATA_CHANGE_FIELD_LABELS[request.field] ?? request.field}: „${request.newValue}”`,
    createdAt: request.createdAt,
    href: "/admin/patients/data-change-requests",
  }));
}

async function getSpecialistNotifications(specialistId: string, locationId: string) {
  const notificationsFrom = new Date(Date.now() - NOTIFICATIONS_DAYS * 24 * 60 * 60 * 1000);

  const recentAppointments = await prisma.appointment.findMany({
    where: {
      specialistId,
      locationId,
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
  });

  const appointmentById = new Map(
    recentAppointments.map((appointment) => [appointment.id, appointment]),
  );
  const auditConditions: Prisma.AuditLogWhereInput[] = [
    { entity: "SpecialistMessage", entityId: specialistId },
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
      // wpisy bez konta pracownika (gość) mają actorId = null — samo "not" w SQL
      // pomijałoby NULL, więc uwzględniamy je jawnie
      AND: [{ OR: [{ actorId: null }, { actorId: { not: specialistId } }] }, { OR: auditConditions }],
    },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  const staffNames = await resolveStaffNames(
    auditLogs.filter((log) => !log.actorName).map((log) => log.actorId),
  );
  const actorNameOf = (log: { actorName: string | null; actorId: string | null }) =>
    log.actorName ?? (log.actorId ? staffNames.get(log.actorId) : null) ?? "systemu";

  const notifications: NotificationItem[] = [];
  for (const log of auditLogs) {
    if (notifications.length >= NOTIFICATIONS_LIMIT) break;
    const data =
      log.data && typeof log.data === "object" && !Array.isArray(log.data)
        ? (log.data as Record<string, unknown>)
        : {};

    if (log.entity === "SpecialistMessage") {
      notifications.push({
        id: log.id,
        kind: "message",
        title: `Wiadomość od ${actorNameOf(log)}`,
        description:
          typeof data.message === "string" ? data.message : "Nowa wiadomość od administratora.",
        createdAt: log.createdAt,
      });
      continue;
    }

    const appointment = log.entityId ? appointmentById.get(log.entityId) : null;
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
        title: `Wiadomość od ${actorNameOf(log)}`,
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

  return notifications;
}

export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;

  let notifications: NotificationItem[];
  if (user!.role === "SPECIALIST") {
    notifications = await getSpecialistNotifications(user!.id, user!.locationId);
  } else if (user!.role === "ADMIN" || user!.role === "RECEPTION") {
    notifications = await getAdminNotifications();
  } else {
    return NextResponse.json({ ok: true, notifications: [], unreadCount: 0 });
  }

  const readRows = notifications.length
    ? await prisma.notificationRead.findMany({
        where: {
          userId: user!.id,
          notificationId: { in: notifications.map((notification) => notification.id) },
        },
        select: { notificationId: true },
      })
    : [];
  const readIds = new Set(readRows.map((row) => row.notificationId));
  const shaped = notifications.map((notification) => ({
    ...notification,
    read: readIds.has(notification.id),
  }));

  return NextResponse.json({
    ok: true,
    notifications: shaped,
    unreadCount: shaped.filter((notification) => !notification.read).length,
  });
}

export async function PATCH(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const json = await req.json().catch(() => null);
  const parsed = MarkReadSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: "Niepoprawne dane" }, { status: 400 });
  }

  // Stan "przeczytane" to zwykłe dane użytkownika, nie zdarzenie do audytu —
  // trzymamy go w osobnej tabeli, żeby dziennik zdarzeń (AuditLog) pozostał
  // niezmienny i nigdy nie był kasowany.
  if (parsed.data.read) {
    await prisma.notificationRead.upsert({
      where: {
        userId_notificationId: { userId: user!.id, notificationId: parsed.data.notificationId },
      },
      create: { userId: user!.id, notificationId: parsed.data.notificationId },
      update: {},
    });
  } else {
    // Ponowne oznaczenie jako nieprzeczytane
    await prisma.notificationRead.deleteMany({
      where: { userId: user!.id, notificationId: parsed.data.notificationId },
    });
  }

  return NextResponse.json({ ok: true });
}
