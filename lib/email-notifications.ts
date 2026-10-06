// Wysyłka wiadomości e-mail z poziomu aplikacji: ustawienia administratora
// (które rodzaje są włączone, kto dostaje powiadomienia), dziennik wysyłek
// i gotowe funkcje "powiadom o ...". Żadna z nich nie rzuca wyjątku — problem
// z pocztą nie może zepsuć rezerwacji ani zmiany wizyty; skutek wysyłki widać
// w dzienniku (panel admina → Poczta e-mail).
//
// Te same funkcje wysyłają też powiadomienia push (lib/push.ts): każde
// zdarzenie idzie oboma kanałami, o ile odbiorca ma adres e-mail / urządzenie
// z włączonymi powiadomieniami, a dany rodzaj nie jest wyłączony.

import { prisma } from "@/lib/db";
import { sendEmail, type SendEmailResult } from "@/lib/mailer";
import { warsawParts, warsawWallTimeToUtc } from "@/lib/warsaw-time";
import type { EmailType } from "@/lib/email-types";
import { pushContent, sendPushToPatient, sendPushToStaff } from "@/lib/push";
import {
  appointmentCanceledEmail,
  appointmentChangedEmail,
  appointmentReminderEmail,
  bookingConfirmationEmail,
  imageConsentDecisionEmail,
  staffDataChangeRequestEmail,
  staffImageConsentRevocationEmail,
  staffNewBookingEmail,
  type AppointmentEmailData,
  type EmailContent,
} from "@/lib/email-templates";

const SETTINGS_ID = "default";
// Wewnętrzna "usługa" blokady terminu w kalendarzu — to nie wizyta klienta.
const RESERVATION_SERVICE_NAME = "__DERCLINIC_REZERWACJA_CZASU__";

export type EmailSettingsValue = {
  disabledTypes: string[];
  staffRecipients: string[];
  notifySpecialist: boolean;
  replyTo: string | null;
};

export const DEFAULT_EMAIL_SETTINGS: EmailSettingsValue = {
  disabledTypes: [],
  staffRecipients: [],
  notifySpecialist: true,
  replyTo: null,
};

export async function getEmailSettings(): Promise<EmailSettingsValue> {
  const row = await prisma.emailSettings.findUnique({ where: { id: SETTINGS_ID } });
  if (!row) return DEFAULT_EMAIL_SETTINGS;
  return {
    disabledTypes: row.disabledTypes,
    staffRecipients: row.staffRecipients,
    notifySpecialist: row.notifySpecialist,
    replyTo: row.replyTo,
  };
}

export async function saveEmailSettings(value: EmailSettingsValue) {
  await prisma.emailSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, ...value },
    update: value,
  });
}

/** Adres aplikacji do linków w wiadomościach. */
export function appBaseUrl(req?: Request) {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "");
  if (configured) return configured;
  return req ? new URL(req.url).origin : "";
}

type TrackedEmailInput = EmailContent & {
  type: EmailType;
  to: string;
  // Wiadomość z tym samym kluczem nie pójdzie drugi raz (np. przypomnienie).
  dedupeKey?: string;
  appointmentId?: string | null;
  patientId?: string | null;
  settings?: EmailSettingsValue;
};

export type TrackedEmailResult = SendEmailResult | { ok: false; skipped: true; error: string; disabled: true };

/**
 * Wysyła wiadomość z uwzględnieniem ustawień admina i zapisuje wynik w
 * dzienniku wysyłek. Nigdy nie rzuca wyjątku.
 */
export async function sendTrackedEmail(input: TrackedEmailInput): Promise<TrackedEmailResult> {
  try {
    const settings = input.settings ?? (await getEmailSettings());
    if (settings.disabledTypes.includes(input.type)) {
      return { ok: false, skipped: true, error: "Ten rodzaj wiadomości jest wyłączony.", disabled: true };
    }

    if (input.dedupeKey) {
      const already = await prisma.emailLog.findUnique({ where: { dedupeKey: input.dedupeKey }, select: { id: true } });
      if (already) return { ok: false, skipped: true, error: "Wiadomość była już wysłana.", disabled: true };
    }

    const result = await sendEmail({
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      replyTo: settings.replyTo,
    });

    await prisma.emailLog
      .create({
        data: {
          type: input.type,
          recipient: input.to,
          subject: input.subject.slice(0, 300),
          status: result.ok ? "SENT" : result.skipped ? "SKIPPED" : "FAILED",
          error: result.ok ? null : result.error,
          providerId: result.ok ? result.id : null,
          dedupeKey: result.ok ? (input.dedupeKey ?? null) : null,
          appointmentId: input.appointmentId ?? null,
          patientId: input.patientId ?? null,
        },
      })
      .catch((e) => console.error("[email] nie zapisano wpisu dziennika wysyłek", e));

    return result;
  } catch (e) {
    console.error("[email] nieoczekiwany błąd wysyłki", input.type, e);
    return { ok: false, skipped: false, error: "Nieoczekiwany błąd wysyłki." };
  }
}

async function loadAppointment(appointmentId: string) {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      id: true,
      startsAt: true,
      status: true,
      deletedAt: true,
      customServiceName: true,
      patientId: true,
      locationId: true,
      specialistId: true,
      patient: { select: { name: true, email: true } },
      specialist: { select: { name: true, email: true } },
      service: { select: { name: true } },
      location: { select: { name: true } },
    },
  });
  if (!appointment || appointment.deletedAt) return null;
  if (appointment.service.name === RESERVATION_SERVICE_NAME) return null;

  const data: AppointmentEmailData = {
    patientName: appointment.patient.name,
    serviceName: appointment.customServiceName || appointment.service.name,
    specialistName: appointment.specialist.name,
    locationName: appointment.location?.name ?? null,
    startsAt: appointment.startsAt,
  };
  return { appointment, data };
}

function uniqueEmails(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const email = value?.trim();
    if (!email || seen.has(email.toLowerCase())) continue;
    seen.add(email.toLowerCase());
    out.push(email);
  }
  return out;
}

/**
 * Nowa wizyta: potwierdzenie dla klienta, a przy rezerwacji online także
 * powiadomienie personelu (odbiorcy z ustawień + specjalista, którego dotyczy).
 */
export async function notifyAppointmentBooked(
  appointmentId: string,
  options: { source: "online" | "staff"; baseUrl: string },
) {
  try {
    const loaded = await loadAppointment(appointmentId);
    if (!loaded || loaded.appointment.startsAt.getTime() <= Date.now()) return;
    const { appointment, data } = loaded;
    const settings = await getEmailSettings();
    const ref = { appointmentId: appointment.id, patientId: appointment.patientId, settings };

    await sendPushToPatient(appointment.patientId, pushContent.bookingConfirmation(appointment.startsAt), {
      type: "PATIENT_BOOKING_CONFIRMATION",
      recipientLabel: appointment.patient.name,
      appointmentId: appointment.id,
    });

    if (appointment.patient.email) {
      await sendTrackedEmail({
        ...bookingConfirmationEmail(data, options.baseUrl),
        type: "PATIENT_BOOKING_CONFIRMATION",
        to: appointment.patient.email,
        ...ref,
      });
    }

    if (options.source === "online") {
      // Push: administratorzy, recepcja z lokalizacji wizyty i (opcjonalnie)
      // specjalista — ci z nich, którzy włączyli powiadomienia na swoim urządzeniu.
      const staff = await prisma.user.findMany({
        where: {
          OR: [
            { role: "ADMIN" },
            { role: "RECEPTION", locationId: appointment.locationId },
            ...(settings.notifySpecialist ? [{ id: appointment.specialistId }] : []),
          ],
        },
        select: { id: true },
      });
      await sendPushToStaff(
        staff.map((member) => member.id),
        pushContent.staffNewBooking(appointment.patient.name, appointment.startsAt),
        { type: "STAFF_NEW_ONLINE_BOOKING", recipientLabel: "Personel", appointmentId: appointment.id },
      );

      const recipients = uniqueEmails([
        ...settings.staffRecipients,
        settings.notifySpecialist ? appointment.specialist.email : null,
      ]);
      // Po kolei, nie równolegle — Resend ogranicza liczbę żądań na sekundę.
      for (const to of recipients) {
        await sendTrackedEmail({
          ...staffNewBookingEmail(data, options.baseUrl),
          type: "STAFF_NEW_ONLINE_BOOKING",
          to,
          ...ref,
        });
      }
    }
  } catch (e) {
    console.error("[email] notifyAppointmentBooked", e);
  }
}

/** Zmiana terminu lub specjalisty zaplanowanej, przyszłej wizyty. */
export async function notifyAppointmentChanged(
  appointmentId: string,
  options: { previousStartsAt: Date; baseUrl: string },
) {
  try {
    const loaded = await loadAppointment(appointmentId);
    if (!loaded) return;
    const { appointment, data } = loaded;
    if (appointment.status !== "SCHEDULED" || appointment.startsAt.getTime() <= Date.now()) return;

    await sendPushToPatient(appointment.patientId, pushContent.appointmentChanged(appointment.startsAt), {
      type: "PATIENT_APPOINTMENT_CHANGED",
      recipientLabel: appointment.patient.name,
      appointmentId: appointment.id,
    });
    if (!appointment.patient.email) return;

    await sendTrackedEmail({
      ...appointmentChangedEmail(data, options.previousStartsAt, options.baseUrl),
      type: "PATIENT_APPOINTMENT_CHANGED",
      to: appointment.patient.email,
      appointmentId: appointment.id,
      patientId: appointment.patientId,
    });
  } catch (e) {
    console.error("[email] notifyAppointmentChanged", e);
  }
}

/**
 * Odwołanie wizyty. Tylko dla wizyt, które jeszcze się nie odbyły — oznaczenie
 * wczorajszej wizyty jako odwołanej to porządki w kalendarzu, nie wiadomość
 * dla klienta.
 */
export async function notifyAppointmentCanceled(appointmentId: string, options: { baseUrl: string }) {
  try {
    const loaded = await loadAppointment(appointmentId);
    if (!loaded) return;
    const { appointment, data } = loaded;
    if (appointment.status !== "CANCELED" || appointment.startsAt.getTime() <= Date.now()) return;

    await sendPushToPatient(appointment.patientId, pushContent.appointmentCanceled(appointment.startsAt), {
      type: "PATIENT_APPOINTMENT_CANCELED",
      recipientLabel: appointment.patient.name,
      appointmentId: appointment.id,
    });
    if (!appointment.patient.email) return;

    await sendTrackedEmail({
      ...appointmentCanceledEmail(data, options.baseUrl),
      type: "PATIENT_APPOINTMENT_CANCELED",
      to: appointment.patient.email,
      appointmentId: appointment.id,
      patientId: appointment.patientId,
    });
  } catch (e) {
    console.error("[email] notifyAppointmentCanceled", e);
  }
}

const DATA_CHANGE_FIELD_LABELS: Record<string, string> = {
  NAME: "Imię i nazwisko",
  PHONE: "Telefon",
  EMAIL: "E-mail",
};

/** Prośba klienta o zmianę danych — powiadomienie dla odbiorców z ustawień. */
export async function notifyDataChangeRequest(requestId: string, options: { baseUrl: string }) {
  try {
    const request = await prisma.patientDataChangeRequest.findUnique({
      where: { id: requestId },
      select: { field: true, patientId: true, patient: { select: { name: true } } },
    });
    if (!request) return;
    const staff = await prisma.user.findMany({
      where: { role: { in: ["ADMIN", "RECEPTION"] } },
      select: { id: true },
    });
    await sendPushToStaff(
      staff.map((member) => member.id),
      pushContent.staffDataChangeRequest(request.patient.name),
      { type: "STAFF_DATA_CHANGE_REQUEST", recipientLabel: "Personel", patientId: request.patientId },
    );
    const settings = await getEmailSettings();
    // Sama treść zmiany (stary i nowy telefon/e-mail) zostaje w panelu —
    // w wiadomości podajemy tylko, kto i jakie pole chce zmienić.
    const content = staffDataChangeRequestEmail(
      { patientName: request.patient.name, fieldLabel: DATA_CHANGE_FIELD_LABELS[request.field] ?? request.field },
      options.baseUrl,
    );
    for (const to of uniqueEmails(settings.staffRecipients)) {
      await sendTrackedEmail({
        ...content,
        type: "STAFF_DATA_CHANGE_REQUEST",
        to,
        patientId: request.patientId,
        settings,
      });
    }
  } catch (e) {
    console.error("[email] notifyDataChangeRequest", e);
  }
}

/**
 * Prośba klienta o cofnięcie zgody na wizerunek: push dla recepcji i adminów
 * (admin widzi też powiadomienie w panelu), e-mail tylko do recepcji z
 * lokalizacji wizyty — administrator maila nie dostaje.
 */
export async function notifyImageConsentRevocationRequest(requestId: string, options: { baseUrl: string }) {
  try {
    const request = await prisma.imageConsentRevocationRequest.findUnique({
      where: { id: requestId },
      select: {
        patientId: true,
        patient: { select: { name: true } },
        appointment: {
          select: {
            startsAt: true,
            locationId: true,
            customServiceName: true,
            service: { select: { name: true } },
          },
        },
      },
    });
    if (!request) return;
    const staff = await prisma.user.findMany({
      where: {
        OR: [{ role: "ADMIN" }, { role: "RECEPTION", locationId: request.appointment.locationId ?? undefined }],
      },
      select: { id: true, role: true, email: true },
    });
    await sendPushToStaff(
      staff.map((member) => member.id),
      pushContent.staffImageConsentRevocation(request.patient.name),
      { type: "STAFF_IMAGE_CONSENT_REVOCATION", recipientLabel: "Personel", patientId: request.patientId },
    );

    const settings = await getEmailSettings();
    const content = staffImageConsentRevocationEmail(
      {
        patientName: request.patient.name,
        serviceName: request.appointment.customServiceName || request.appointment.service.name,
        startsAt: request.appointment.startsAt,
      },
      options.baseUrl,
    );
    const recipients = uniqueEmails(staff.filter((member) => member.role === "RECEPTION").map((m) => m.email));
    for (const to of recipients) {
      await sendTrackedEmail({
        ...content,
        type: "STAFF_IMAGE_CONSENT_REVOCATION",
        to,
        patientId: request.patientId,
        settings,
      });
    }
  } catch (e) {
    console.error("[email] notifyImageConsentRevocationRequest", e);
  }
}

/** Decyzja recepcji ws. cofnięcia zgody na wizerunek — wiadomość do klienta (e-mail + push). */
export async function notifyImageConsentDecision(requestId: string, options: { baseUrl: string }) {
  try {
    const request = await prisma.imageConsentRevocationRequest.findUnique({
      where: { id: requestId },
      select: {
        status: true,
        rejectionReason: true,
        patientId: true,
        patient: { select: { name: true, email: true } },
        appointment: { select: { startsAt: true, customServiceName: true, service: { select: { name: true } } } },
      },
    });
    if (!request || request.status === "PENDING") return;
    const approved = request.status === "APPROVED";

    await sendPushToPatient(request.patientId, pushContent.imageConsentDecision(approved), {
      type: "PATIENT_IMAGE_CONSENT_DECISION",
      recipientLabel: request.patient.name,
    });
    if (!request.patient.email) return;

    await sendTrackedEmail({
      ...imageConsentDecisionEmail(
        {
          patientName: request.patient.name,
          serviceName: request.appointment.customServiceName || request.appointment.service.name,
          startsAt: request.appointment.startsAt,
          approved,
          rejectionReason: request.rejectionReason,
        },
        options.baseUrl,
      ),
      type: "PATIENT_IMAGE_CONSENT_DECISION",
      to: request.patient.email,
      patientId: request.patientId,
    });
  } catch (e) {
    console.error("[email] notifyImageConsentDecision", e);
  }
}

/**
 * Przypomnienia dla klientów, którzy mają wizytę JUTRO (według czasu
 * warszawskiego). Wołane raz dziennie przez Vercel Cron oraz ręcznie z panelu
 * admina; klucz dedupeKey gwarantuje, że to samo przypomnienie nie pójdzie
 * dwa razy, więc ponowne uruchomienie jest bezpieczne.
 */
export async function sendDueReminders(options: { baseUrl: string; budgetMs?: number }) {
  const startedAt = Date.now();
  const summary = {
    due: 0,
    sent: 0,
    alreadySent: 0,
    failed: 0,
    pushSent: 0,
    notConfigured: false,
    disabled: false,
    timedOut: false,
  };

  const settings = await getEmailSettings();
  const emailEnabled = !settings.disabledTypes.includes("PATIENT_REMINDER");

  const today = warsawParts();
  const tomorrow = new Date(Date.UTC(today.year, today.month - 1, today.day + 1));
  const dayAfter = new Date(Date.UTC(today.year, today.month - 1, today.day + 2));
  const dayStart = (d: Date) =>
    warsawWallTimeToUtc({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), hour: 0, minute: 0 });

  const appointments = await prisma.appointment.findMany({
    where: {
      deletedAt: null,
      status: "SCHEDULED",
      startsAt: { gte: dayStart(tomorrow), lt: dayStart(dayAfter) },
      service: { name: { not: RESERVATION_SERVICE_NAME } },
      // Klient musi mieć jak się skontaktować: e-mail albo urządzenie z push.
      patient: { OR: [{ email: { not: null } }, { pushSubscriptions: { some: {} } }] },
    },
    orderBy: { startsAt: "asc" },
    select: { id: true, startsAt: true },
  });
  summary.due = appointments.length;

  for (const { id, startsAt } of appointments) {
    if (options.budgetMs && Date.now() - startedAt > options.budgetMs) {
      summary.timedOut = true;
      break;
    }
    // Zmiana terminu daje nowy klucz, więc po przełożeniu wizyty na inny
    // dzień klient dostanie przypomnienie także o nowym terminie.
    const dedupeKey = `reminder:${id}:${startsAt.getTime()}`;
    const loaded = await loadAppointment(id);
    if (!loaded) continue;

    const push = await sendPushToPatient(loaded.appointment.patientId, pushContent.reminder(startsAt), {
      type: "PATIENT_REMINDER",
      recipientLabel: loaded.appointment.patient.name,
      dedupeKey: `push-${dedupeKey}`,
      appointmentId: id,
    });
    if (push.sent > 0) summary.pushSent += 1;

    // E-mail: tylko gdy klient ma adres, przypomnienia e-mail są włączone
    // i wysyłka w ogóle jest skonfigurowana.
    if (!loaded.appointment.patient.email || !emailEnabled || summary.notConfigured) continue;

    const result = await sendTrackedEmail({
      ...appointmentReminderEmail(loaded.data, options.baseUrl),
      type: "PATIENT_REMINDER",
      to: loaded.appointment.patient.email,
      dedupeKey,
      appointmentId: id,
      patientId: loaded.appointment.patientId,
      settings,
    });

    if (result.ok) summary.sent += 1;
    else if ("disabled" in result) summary.alreadySent += 1;
    else if (result.skipped) {
      // Brak klucza API — kolejne e-maile skończą się tak samo (push idzie dalej).
      summary.notConfigured = true;
    } else summary.failed += 1;
  }

  summary.disabled = !emailEnabled;
  return summary;
}
