import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

// Ograniczanie liczby prób (audyt bezpieczeństwa, F-05) dla logowania, resetu
// hasła, rejestracji i rezerwacji online. Liczniki trzymamy w Postgresie
// (tabela RateLimitBucket), bo aplikacja działa jako funkcje serverless —
// pamięć procesu nie jest współdzielona między wywołaniami.
//
// Dwa rodzaje kluczy:
//  * per IP — liczy KAŻDĄ próbę (chroni też przed DoS przez kosztowny bcrypt),
//  * per konto — liczy tylko NIEUDANE próby, więc atak na jedno konto nie
//    blokuje innych użytkowników, a poprawne logowanie zeruje licznik.

export type RateLimitRule = {
  // Zakres, np. "staff-login-ip". Trafia do klucza i do dziennika zdarzeń.
  scope: string;
  limit: number;
  windowMs: number;
};

export type RateLimitResult = { allowed: boolean; count: number; retryAfterSec: number };

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

export const RATE_LIMITS = {
  staffLoginIp: { scope: "staff-login-ip", limit: 30, windowMs: 15 * MINUTE },
  staffLoginAccount: { scope: "staff-login-account", limit: 5, windowMs: 15 * MINUTE },
  patientLoginIp: { scope: "patient-login-ip", limit: 30, windowMs: 15 * MINUTE },
  patientLoginAccount: { scope: "patient-login-account", limit: 5, windowMs: 15 * MINUTE },
  patientRegisterIp: { scope: "patient-register-ip", limit: 10, windowMs: HOUR },
  forgotPasswordIp: { scope: "forgot-password-ip", limit: 10, windowMs: HOUR },
  forgotPasswordAccount: { scope: "forgot-password-account", limit: 3, windowMs: HOUR },
  resetPasswordIp: { scope: "reset-password-ip", limit: 20, windowMs: HOUR },
  publicBookingIp: { scope: "public-booking-ip", limit: 20, windowMs: HOUR },
  mfaIp: { scope: "mfa-ip", limit: 30, windowMs: 15 * MINUTE },
  mfaAccount: { scope: "mfa-account", limit: 5, windowMs: 15 * MINUTE },
  operatorPinIp: { scope: "operator-pin-ip", limit: 30, windowMs: 15 * MINUTE },
  operatorPinAccount: { scope: "operator-pin-account", limit: 5, windowMs: 15 * MINUTE },
  consentUploadIp: { scope: "consent-upload-ip", limit: 20, windowMs: HOUR },
  emailTest: { scope: "email-test", limit: 10, windowMs: HOUR },
  pushManual: { scope: "push-manual", limit: 30, windowMs: HOUR },
} satisfies Record<string, RateLimitRule>;

export async function clientIp(): Promise<string> {
  try {
    const h = (await headers());
    // Na Vercelu x-real-ip / pierwszy wpis x-forwarded-for ustawia sama
    // platforma (nadpisuje wartość podaną przez klienta).
    const ip = h.get("x-real-ip")?.trim() || h.get("x-forwarded-for")?.split(",")[0]?.trim();
    return ip ? ip.slice(0, 64) : "unknown";
  } catch {
    return "unknown";
  }
}

function bucketKey(rule: RateLimitRule, subject: string) {
  return `${rule.scope}:${subject.trim().toLowerCase().slice(0, 200)}`;
}

function toResult(rule: RateLimitRule, count: number, windowStart: Date): RateLimitResult {
  const retryAfterMs = windowStart.getTime() + rule.windowMs - Date.now();
  return {
    allowed: count <= rule.limit,
    count,
    retryAfterSec: Math.max(1, Math.ceil(retryAfterMs / 1000)),
  };
}

async function maybeCleanup() {
  // Sprzątanie starych liczników przy ok. 1% wywołań — bez osobnego crona.
  if (Math.random() > 0.01) return;
  await prisma.rateLimitBucket
    .deleteMany({ where: { windowStart: { lt: new Date(Date.now() - 24 * HOUR) } } })
    .catch(() => {});
}

/**
 * Zlicza próbę i zwraca, czy mieści się w limicie. Operacja jest atomowa
 * (jedno INSERT ... ON CONFLICT), więc równoległe żądania nie "przeskoczą" limitu.
 */
export async function hitRateLimit(rule: RateLimitRule, subject: string): Promise<RateLimitResult> {
  const key = bucketKey(rule, subject);
  // Czas liczony w całości po stronie bazy, w UTC (kolumna to timestamp bez
  // strefy — tak samo zapisuje ją Prisma).
  const rows = await prisma.$queryRaw<{ count: number; windowStart: Date }[]>`
    INSERT INTO "RateLimitBucket" ("key", "count", "windowStart")
    VALUES (${key}, 1, NOW() AT TIME ZONE 'UTC')
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE
        WHEN "RateLimitBucket"."windowStart" <= (NOW() AT TIME ZONE 'UTC') - make_interval(secs => ${rule.windowMs / 1000})
        THEN 1 ELSE "RateLimitBucket"."count" + 1 END,
      "windowStart" = CASE
        WHEN "RateLimitBucket"."windowStart" <= (NOW() AT TIME ZONE 'UTC') - make_interval(secs => ${rule.windowMs / 1000})
        THEN NOW() AT TIME ZONE 'UTC' ELSE "RateLimitBucket"."windowStart" END
    RETURNING "count", "windowStart"`;
  void maybeCleanup();
  const row = rows[0];
  const result = toResult(rule, Number(row.count), new Date(row.windowStart));
  // Do dziennika tylko w momencie przekroczenia progu, nie przy każdej kolejnej próbie.
  if (result.count === rule.limit + 1) await logRateLimited(rule, subject);
  return result;
}

/** Sprawdza limit bez zliczania próby (np. przed weryfikacją hasła). */
export async function peekRateLimit(rule: RateLimitRule, subject: string): Promise<RateLimitResult> {
  const bucket = await prisma.rateLimitBucket.findUnique({ where: { key: bucketKey(rule, subject) } });
  if (!bucket || bucket.windowStart.getTime() + rule.windowMs <= Date.now()) {
    return { allowed: true, count: 0, retryAfterSec: 0 };
  }
  // peek pozwala na próbę, jeśli po jej ewentualnym zliczeniu wciąż mieścimy się w limicie
  const result = toResult(rule, bucket.count, bucket.windowStart);
  return { ...result, allowed: bucket.count < rule.limit };
}

export async function resetRateLimit(rule: RateLimitRule, subject: string) {
  await prisma.rateLimitBucket.deleteMany({ where: { key: bucketKey(rule, subject) } });
}

async function logRateLimited(rule: RateLimitRule, subject: string) {
  const isIp = rule.scope.endsWith("-ip");
  await logAudit({
    actor: { type: "GUEST", contact: isIp ? null : subject },
    action: "RATE_LIMITED",
    entity: "Security",
    summary: `Zablokowano kolejne próby (${rule.scope}) — przekroczono ${rule.limit} w ciągu ${Math.round(
      rule.windowMs / MINUTE,
    )} min${isIp ? ` z adresu IP ${subject}` : ` dla konta „${subject}”`}`,
    data: { scope: rule.scope, limit: rule.limit, windowMinutes: Math.round(rule.windowMs / MINUTE), subject },
  });
}

export function tooManyRequests(result: RateLimitResult, message?: string) {
  const minutes = Math.ceil(result.retryAfterSec / 60);
  return NextResponse.json(
    {
      ok: false,
      code: "RATE_LIMITED",
      message: message ?? `Zbyt wiele prób. Spróbuj ponownie za ${minutes} min.`,
    },
    { status: 429, headers: { "Retry-After": String(result.retryAfterSec) } },
  );
}

/**
 * Progresywne opóźnienie odpowiedzi po nieudanej próbie: 0,5 s, 1 s, 1,5 s…
 * maks. 3 s. Spowalnia zgadywanie haseł bez blokowania prawidłowych użytkowników.
 */
export async function failureDelay(failures: number) {
  const ms = Math.min(3000, Math.max(0, failures) * 500);
  if (ms > 0) await new Promise((resolve) => setTimeout(resolve, ms));
}
