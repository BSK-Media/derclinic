// Powiadomienia push (Web Push) dla klientów i personelu. Działają w
// przeglądarkach oraz w aplikacji dodanej do ekranu głównego (na iPhonie tylko
// tam, iOS 16.4+). Urządzenie samo zgłasza się do powiadomień
// (components/push-toggle.tsx), a serwer wysyła je przez usługę push
// przeglądarki, podpisując się kluczami VAPID.
//
// Tak jak przy e-mailach: żadna funkcja stąd nie rzuca wyjątku, a skutek
// wysyłki trafia do wspólnego dziennika (EmailLog z channel = "PUSH").

import webpush from "web-push";
import { prisma } from "@/lib/db";
import { openSecret, sealSecret } from "@/lib/secret-box";
import type { EmailType } from "@/lib/email-types";

const CONFIG_ID = "default";
const SETTINGS_ID = "default";

export type PushPayload = {
  title: string;
  body: string;
  // Adres otwierany po kliknięciu powiadomienia (ścieżka w aplikacji).
  url?: string;
  // Powiadomienia z tym samym tagiem zastępują się na urządzeniu.
  tag?: string;
};

type VapidKeys = { publicKey: string; privateKey: string };
let cachedKeys: VapidKeys | null = null;

/**
 * Klucze VAPID: ze zmiennych środowiskowych (VAPID_PUBLIC_KEY /
 * VAPID_PRIVATE_KEY), a gdy ich nie ma — z bazy; przy pierwszym użyciu
 * tworzone automatycznie, więc powiadomienia nie wymagają konfiguracji.
 */
export async function getVapidKeys(): Promise<VapidKeys> {
  if (cachedKeys) return cachedKeys;

  const envPublic = process.env.VAPID_PUBLIC_KEY?.trim();
  const envPrivate = process.env.VAPID_PRIVATE_KEY?.trim();
  if (envPublic && envPrivate) {
    cachedKeys = { publicKey: envPublic, privateKey: envPrivate };
    return cachedKeys;
  }

  let row = await prisma.pushConfig.findUnique({ where: { id: CONFIG_ID } });
  if (!row) {
    const generated = webpush.generateVAPIDKeys();
    try {
      row = await prisma.pushConfig.create({
        data: {
          id: CONFIG_ID,
          vapidPublicKey: generated.publicKey,
          vapidPrivateKeyEnc: sealSecret(generated.privateKey),
        },
      });
    } catch {
      // Równoległe żądanie zdążyło utworzyć klucze — bierzemy tamte.
      row = await prisma.pushConfig.findUnique({ where: { id: CONFIG_ID } });
    }
  }
  if (!row) throw new Error("Nie udało się przygotować kluczy powiadomień push");

  cachedKeys = { publicKey: row.vapidPublicKey, privateKey: openSecret(row.vapidPrivateKeyEnc) };
  return cachedKeys;
}

// Kontakt do nadawcy wymagany przez usługi push (adres mailto: albo https:).
function vapidSubject() {
  const configured = process.env.VAPID_SUBJECT?.trim();
  if (configured) return configured;
  const fromEmail = /<([^>]+@[^>]+)>/.exec(process.env.RESEND_FROM_EMAIL ?? "")?.[1];
  return `mailto:${fromEmail ?? "kontakt@derclinic.pl"}`;
}

export async function getDisabledPushTypes(): Promise<string[]> {
  const row = await prisma.emailSettings.findUnique({
    where: { id: SETTINGS_ID },
    select: { disabledPushTypes: true },
  });
  return row?.disabledPushTypes ?? [];
}

export async function saveDisabledPushTypes(disabledPushTypes: string[]) {
  await prisma.emailSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, disabledPushTypes },
    update: { disabledPushTypes },
  });
}

type StoredSubscription = { id: string; endpoint: string; p256dh: string; auth: string };

/** Wysyła jedno powiadomienie na podane urządzenia; wygasłe subskrypcje usuwa. */
async function deliver(subscriptions: StoredSubscription[], payload: PushPayload) {
  const keys = await getVapidKeys();
  const body = JSON.stringify(payload);
  const delivered: string[] = [];
  const expired: string[] = [];
  let lastError = "";

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
          body,
          {
            vapidDetails: { subject: vapidSubject(), publicKey: keys.publicKey, privateKey: keys.privateKey },
            // Usługa push przechowa powiadomienie do 12 godzin, gdy telefon jest offline.
            TTL: 12 * 60 * 60,
          },
        );
        delivered.push(subscription.id);
      } catch (e) {
        const status = (e as { statusCode?: number })?.statusCode;
        // 404/410 = subskrypcja nie istnieje (odinstalowana aplikacja, cofnięta zgoda).
        if (status === 404 || status === 410) expired.push(subscription.id);
        else lastError = `Usługa push odpowiedziała błędem${status ? ` ${status}` : ""}`;
      }
    }),
  );

  if (expired.length > 0) {
    await prisma.pushSubscription.deleteMany({ where: { id: { in: expired } } }).catch(() => {});
  }
  if (delivered.length > 0) {
    await prisma.pushSubscription
      .updateMany({ where: { id: { in: delivered } }, data: { lastUsedAt: new Date() } })
      .catch(() => {});
  }
  return { sent: delivered.length, expired: expired.length, failed: subscriptions.length - delivered.length - expired.length, lastError };
}

export type PushResult = {
  // Liczba urządzeń, na które powiadomienie faktycznie poszło.
  sent: number;
  // Urządzenia z włączonymi powiadomieniami, jakie mieli adresaci.
  devices: number;
  skipped?: "disabled" | "duplicate" | "no-devices";
  error?: string;
};

type PushMeta = {
  type: EmailType;
  // Kto jest adresatem — do dziennika wysyłek, np. imię i nazwisko klienta.
  recipientLabel: string;
  dedupeKey?: string;
  appointmentId?: string | null;
  patientId?: string | null;
};

async function sendAndLog(
  subscriptions: StoredSubscription[],
  payload: PushPayload,
  meta: PushMeta,
): Promise<PushResult> {
  try {
    if (subscriptions.length === 0) return { sent: 0, devices: 0, skipped: "no-devices" };

    // Powiadomień ręcznych i testowych nie da się wyłączyć przełącznikiem.
    if (meta.type !== "MANUAL" && meta.type !== "TEST") {
      if ((await getDisabledPushTypes()).includes(meta.type)) {
        return { sent: 0, devices: subscriptions.length, skipped: "disabled" };
      }
    }
    if (meta.dedupeKey) {
      const already = await prisma.emailLog.findUnique({ where: { dedupeKey: meta.dedupeKey }, select: { id: true } });
      if (already) return { sent: 0, devices: subscriptions.length, skipped: "duplicate" };
    }

    const outcome = await deliver(subscriptions, payload);
    const ok = outcome.sent > 0;
    // Same wygasłe subskrypcje to nie błąd wysyłki — po prostu nie ma już gdzie wysłać.
    if (!ok && outcome.failed === 0) return { sent: 0, devices: 0, skipped: "no-devices" };

    await prisma.emailLog
      .create({
        data: {
          channel: "PUSH",
          type: meta.type,
          recipient: `${meta.recipientLabel} (urządzeń: ${outcome.sent}/${subscriptions.length})`.slice(0, 300),
          subject: `${payload.title} — ${payload.body}`.slice(0, 300),
          status: ok ? "SENT" : "FAILED",
          error: ok ? null : outcome.lastError || "Nie udało się dostarczyć powiadomienia",
          dedupeKey: ok ? (meta.dedupeKey ?? null) : null,
          appointmentId: meta.appointmentId ?? null,
          patientId: meta.patientId ?? null,
        },
      })
      .catch((e) => console.error("[push] nie zapisano wpisu dziennika wysyłek", e));

    return { sent: outcome.sent, devices: subscriptions.length, error: ok ? undefined : outcome.lastError };
  } catch (e) {
    console.error("[push] nieoczekiwany błąd wysyłki", meta.type, e);
    return { sent: 0, devices: subscriptions.length, error: "Nieoczekiwany błąd wysyłki powiadomienia" };
  }
}

const SUBSCRIPTION_SELECT = { id: true, endpoint: true, p256dh: true, auth: true } as const;

/** Powiadomienie na wszystkie urządzenia jednego klienta. */
export async function sendPushToPatient(patientId: string, payload: PushPayload, meta: PushMeta) {
  const subscriptions = await prisma.pushSubscription
    .findMany({ where: { patientId }, select: SUBSCRIPTION_SELECT })
    .catch(() => []);
  return sendAndLog(subscriptions, payload, { ...meta, patientId });
}

/** Powiadomienie na urządzenia wskazanych pracowników (jeden wpis w dzienniku). */
export async function sendPushToStaff(userIds: string[], payload: PushPayload, meta: PushMeta) {
  if (userIds.length === 0) return { sent: 0, devices: 0, skipped: "no-devices" } satisfies PushResult;
  const subscriptions = await prisma.pushSubscription
    .findMany({ where: { userId: { in: userIds } }, select: SUBSCRIPTION_SELECT })
    .catch(() => []);
  return sendAndLog(subscriptions, payload, meta);
}

/** Powiadomienie do wielu klientów naraz (wysyłka ręczna z panelu admina). */
export async function sendPushToPatients(patientIds: string[] | "all", payload: PushPayload, meta: PushMeta) {
  const subscriptions = await prisma.pushSubscription
    .findMany({
      where: patientIds === "all" ? { patientId: { not: null } } : { patientId: { in: patientIds } },
      select: SUBSCRIPTION_SELECT,
    })
    .catch(() => []);
  return sendAndLog(subscriptions, payload, meta);
}

// --- Treści powiadomień -------------------------------------------------------
// Krótkie i bez nazwy zabiegu: powiadomienie widać na zablokowanym ekranie
// telefonu, więc nie zdradzamy w nim, na jaki zabieg ktoś jest umówiony.

/** Np. "wt., 6 paź, 14:30" (czas warszawski). */
export function formatPushDate(date: Date) {
  const day = date.toLocaleDateString("pl-PL", {
    timeZone: "Europe/Warsaw",
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  return `${day}, ${formatPushTime(date)}`;
}

function formatPushTime(date: Date) {
  return date.toLocaleTimeString("pl-PL", { timeZone: "Europe/Warsaw", hour: "2-digit", minute: "2-digit" });
}

export const pushContent = {
  bookingConfirmation: (startsAt: Date): PushPayload => ({
    title: "Wizyta umówiona",
    body: `${formatPushDate(startsAt)} — do zobaczenia w DerClinic.`,
    url: "/panel-klienta?tab=upcoming",
  }),
  appointmentChanged: (startsAt: Date): PushPayload => ({
    title: "Zmiana w Twojej wizycie",
    body: `Aktualny termin: ${formatPushDate(startsAt)}.`,
    url: "/panel-klienta?tab=upcoming",
  }),
  appointmentCanceled: (startsAt: Date): PushPayload => ({
    title: "Wizyta odwołana",
    body: `Wizyta z ${formatPushDate(startsAt)} została odwołana.`,
    url: "/panel-klienta",
  }),
  reminder: (startsAt: Date): PushPayload => ({
    title: "Przypomnienie o wizycie",
    body: `Jutro o ${formatPushTime(startsAt)} masz wizytę w DerClinic.`,
    url: "/panel-klienta?tab=upcoming",
  }),
  staffNewBooking: (patientName: string, startsAt: Date): PushPayload => ({
    title: "Nowa rezerwacja online",
    body: `${patientName} · ${formatPushDate(startsAt)}`,
    url: "/admin/visits",
  }),
  staffDataChangeRequest: (patientName: string): PushPayload => ({
    title: "Prośba o zmianę danych",
    body: `${patientName} prosi o zmianę danych kontaktowych.`,
    url: "/admin/patients/data-change-requests",
  }),
  staffImageConsentRevocation: (patientName: string): PushPayload => ({
    title: "Cofnięcie zgody na wizerunek",
    body: `${patientName} prosi o cofnięcie zgody na wizerunek.`,
    url: "/admin/patients/image-consent-requests",
  }),
  imageConsentDecision: (approved: boolean): PushPayload => ({
    title: approved ? "Zgoda na wizerunek cofnięta" : "Prośba o cofnięcie zgody odrzucona",
    body: approved
      ? "Zaakceptowaliśmy Twoją prośbę o cofnięcie zgody na wizerunek."
      : "Nie zrealizowaliśmy prośby o cofnięcie zgody na wizerunek.",
    url: "/panel-klienta?tab=consents",
  }),
};
