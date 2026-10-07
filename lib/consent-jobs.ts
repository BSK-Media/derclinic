import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { sendTrackedEmail } from "@/lib/email-notifications";
import { consentCanceledEmail, consentReminderEmail } from "@/lib/email-templates";
import { pushContent, sendPushToPatient, sendPushToStaff } from "@/lib/push";
import { consentPageUrl } from "@/lib/consent-link";
import { warsawParts } from "@/lib/warsaw-time";

// Zadania cykliczne zgody na zabieg (wołane z /api/cron/consent):
//  * anulowanie rezerwacji, którym minął termin zabiegu bez podpisanej zgody
//    (zaliczka przepada — wpłata zostaje, bez zwrotu),
//  * przypomnienia o niepodpisanej zgodzie: push dwa razy dziennie (rano i
//    wieczorem) do dnia zabiegu włącznie, a rano także e-mail.
// Wszystko jest idempotentne (klucze dedupeKey), więc częste uruchamianie
// harmonogramu jest bezpieczne.

const MORNING_HOURS = [8, 13] as const; // [od, do) czasu warszawskiego
const EVENING_HOURS = [17, 22] as const;
// Nie męczymy klienta przypomnieniem tuż po rezerwacji.
const MIN_AGE_BEFORE_REMINDER_MS = 2 * 60 * 60 * 1000;

export type ConsentJobsSummary = {
  slot: "morning" | "evening" | null;
  canceled: number;
  remindersPush: number;
  remindersEmail: number;
};

function slotFor(now: Date): "morning" | "evening" | null {
  const hour = warsawParts(now).hour;
  if (hour >= MORNING_HOURS[0] && hour < MORNING_HOURS[1]) return "morning";
  if (hour >= EVENING_HOURS[0] && hour < EVENING_HOURS[1]) return "evening";
  return null;
}

function warsawDay(now: Date) {
  const p = warsawParts(now);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

const emailData = (appointment: {
  customServiceName: string | null;
  service: { name: string };
  specialist: { name: string };
  location: { name: string } | null;
  startsAt: Date;
  patient: { name: string };
}) => ({
  patientName: appointment.patient.name,
  serviceName: appointment.customServiceName || appointment.service.name,
  specialistName: appointment.specialist.name,
  locationName: appointment.location?.name ?? null,
  startsAt: appointment.startsAt,
});

const jobSelect = {
  id: true,
  startsAt: true,
  locationId: true,
  customServiceName: true,
  patientId: true,
  patient: { select: { name: true, email: true } },
  specialist: { select: { name: true } },
  service: { select: { name: true } },
  location: { select: { name: true } },
} as const;

async function cancelExpired(now: Date, baseUrl: string) {
  const expired = await prisma.appointment.findMany({
    where: { consentStatus: "NOT_SIGNED", status: "SCHEDULED", deletedAt: null, startsAt: { lte: now } },
    select: jobSelect,
    take: 200,
  });

  let canceled = 0;
  for (const appointment of expired) {
    // Warunkowa aktualizacja: jeśli w międzyczasie zgoda wpłynęła, nic nie anulujemy.
    const updated = await prisma.appointment.updateMany({
      where: { id: appointment.id, consentStatus: "NOT_SIGNED", status: "SCHEDULED" },
      data: { status: "CANCELED", consentForfeitedAt: now },
    });
    if (updated.count === 0) continue;
    canceled += 1;

    await logAudit({
      actor: { type: "SYSTEM", name: "Harmonogram" },
      action: "UPDATE",
      entity: "Appointment",
      entityId: appointment.id,
      summary: `Rezerwacja anulowana automatycznie — zgoda na zabieg nie została podpisana do terminu zabiegu (${appointment.patient.name}); zaliczka przepadła`,
      data: { reason: "consent_not_signed", status: { from: "SCHEDULED", to: "CANCELED" } },
    });

    await sendPushToPatient(appointment.patientId, pushContent.consentCanceled(), {
      type: "PATIENT_CONSENT_CANCELED",
      recipientLabel: appointment.patient.name,
      dedupeKey: `consent-canceled-push:${appointment.id}`,
      appointmentId: appointment.id,
    });
    if (appointment.patient.email) {
      await sendTrackedEmail({
        ...consentCanceledEmail(emailData(appointment), baseUrl),
        type: "PATIENT_CONSENT_CANCELED",
        to: appointment.patient.email,
        dedupeKey: `consent-canceled-mail:${appointment.id}`,
        appointmentId: appointment.id,
        patientId: appointment.patientId,
      });
    }

    // Personel (admini i recepcja/manager lokalizacji) wie, że termin się zwolnił.
    const staff = await prisma.user.findMany({
      where: {
        OR: [{ role: "ADMIN" }, { role: { in: ["MANAGER", "RECEPTION"] }, locationId: appointment.locationId ?? undefined }],
      },
      select: { id: true },
    });
    await sendPushToStaff(
      staff.map((member) => member.id),
      pushContent.staffConsentCanceled(appointment.patient.name),
      {
        type: "PATIENT_CONSENT_CANCELED",
        recipientLabel: "Personel",
        dedupeKey: `consent-canceled-staff:${appointment.id}`,
        appointmentId: appointment.id,
      },
    );
  }
  return canceled;
}

async function sendReminders(now: Date, baseUrl: string, slot: "morning" | "evening") {
  const pending = await prisma.appointment.findMany({
    where: {
      consentStatus: "NOT_SIGNED",
      status: "SCHEDULED",
      deletedAt: null,
      startsAt: { gt: now },
      createdAt: { lt: new Date(now.getTime() - MIN_AGE_BEFORE_REMINDER_MS) },
    },
    select: jobSelect,
    take: 500,
  });

  const day = warsawDay(now);
  let remindersPush = 0;
  let remindersEmail = 0;
  for (const appointment of pending) {
    const url = consentPageUrl("", appointment.id); // ścieżka względna: /zgoda/<token>

    const push = await sendPushToPatient(appointment.patientId, pushContent.consentReminder(appointment.startsAt, url), {
      type: "PATIENT_CONSENT_REMINDER",
      recipientLabel: appointment.patient.name,
      dedupeKey: `consent-push:${appointment.id}:${day}:${slot}`,
      appointmentId: appointment.id,
    });
    if (push.sent > 0) remindersPush += 1;

    // E-mail raz dziennie (rano) — dociera też do klientów bez konta i bez powiadomień push.
    if (slot === "morning" && appointment.patient.email) {
      const result = await sendTrackedEmail({
        ...consentReminderEmail(emailData(appointment), consentPageUrl(baseUrl, appointment.id), baseUrl),
        type: "PATIENT_CONSENT_REMINDER",
        to: appointment.patient.email,
        dedupeKey: `consent-mail:${appointment.id}:${day}`,
        appointmentId: appointment.id,
        patientId: appointment.patientId,
      });
      if (result.ok) remindersEmail += 1;
    }
  }
  return { remindersPush, remindersEmail };
}

export async function runConsentJobs(options: { baseUrl: string; now?: Date }): Promise<ConsentJobsSummary> {
  const now = options.now ?? new Date();
  const canceled = await cancelExpired(now, options.baseUrl);
  const slot = slotFor(now);
  const reminders = slot ? await sendReminders(now, options.baseUrl, slot) : { remindersPush: 0, remindersEmail: 0 };
  return { slot, canceled, ...reminders };
}
