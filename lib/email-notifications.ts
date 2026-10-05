// Wysyłka wiadomości e-mail z poziomu aplikacji: ustawienia administratora
// (które rodzaje są włączone, kto dostaje powiadomienia), dziennik wysyłek
// i gotowe funkcje "powiadom o ...". Żadna z nich nie rzuca wyjątku — problem
// z pocztą nie może zepsuć rezerwacji ani zmiany wizyty; skutek wysyłki widać
// w dzienniku (panel admina → Poczta e-mail).

import { prisma } from "@/lib/db";
import { sendEmail, type SendEmailResult } from "@/lib/mailer";
import { warsawParts, warsawWallTimeToUtc } from "@/lib/warsaw-time";
import type { EmailType } from "@/lib/email-types";
import {
  appointmentCanceledEmail,
  appointmentChangedEmail,
  appointmentReminderEmail,
  bookingConfirmationEmail,
  staffDataChangeRequestEmail,
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

    if (appointment.patient.email) {
      await sendTrackedEmail({
        ...bookingConfirmationEmail(data, options.baseUrl),
        type: "PATIENT_BOOKING_CONFIRMATION",
        to: appointment.patient.email,
        ...ref,
      });
    }

    if (options.source === "online") {
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
 * Przypomnienia dla klientów, którzy mają wizytę JUTRO (według czasu
 * warszawskiego). Wołane raz dziennie przez Vercel Cron oraz ręcznie z panelu
 * admina; klucz dedupeKey gwarantuje, że to samo przypomnienie nie pójdzie
 * dwa razy, więc ponowne uruchomienie jest bezpieczne.
 */
export async function sendDueReminders(options: { baseUrl: string; budgetMs?: number }) {
  const startedAt = Date.now();
  const summary = { due: 0, sent: 0, alreadySent: 0, failed: 0, notConfigured: false, disabled: false, timedOut: false };

  const settings = await getEmailSettings();
  if (settings.disabledTypes.includes("PATIENT_REMINDER")) return { ...summary, disabled: true };

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
      patient: { email: { not: null } },
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
    if (!loaded?.appointment.patient.email) continue;

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
      // Brak klucza API — kolejne próby skończą się tak samo.
      summary.notConfigured = true;
      break;
    } else summary.failed += 1;
  }

  return summary;
}
