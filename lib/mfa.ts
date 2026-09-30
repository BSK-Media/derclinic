import { randomInt, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getKey } from "@/lib/auth-keys";
import { ISSUER, revokeAllStaffSessions } from "@/lib/session-core";
import { keyedHash, keyedHashCandidates, openSecret } from "@/lib/secret-box";
import { verifyTotp } from "@/lib/totp";
import { logAudit } from "@/lib/audit";
import { RATE_LIMITS, clientIp, failureDelay, hitRateLimit, peekRateLimit, resetRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { startStaffSession, type AuthUser } from "@/lib/auth-cookie";

// Obowiązkowe uwierzytelnianie dwuskładnikowe personelu (audyt F-04).
//
// Po poprawnym haśle NIE powstaje sesja. Serwer wydaje krótkotrwały (10 min)
// podpisany token "MFA w toku" w osobnym ciasteczku, ograniczonym do
// /api/auth. Pełna sesja (lib/auth-cookie.ts → startStaffSession) powstaje
// dopiero po potwierdzeniu drugiego składnika albo po jego konfiguracji.

export const MFA_ISSUER_NAME = "DerClinic OS";
const MFA_COOKIE = "bsk_mfa";
const MFA_AUDIENCE = "derclinic:staff-mfa";
const MFA_CHALLENGE_TTL_SEC = 10 * 60;
export const STEP_UP_WINDOW_MS = 10 * 60 * 1000;
export const RECOVERY_CODE_COUNT = 10;

export type MfaStage = "enroll" | "verify";

// --- Etap "MFA w toku" ---------------------------------------------------

export async function issueMfaChallenge(userId: string, stage: MfaStage) {
  const token = await new SignJWT({ stage })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setAudience(MFA_AUDIENCE)
    .setSubject(userId)
    .setJti(randomBytes(16).toString("base64url"))
    .setIssuedAt()
    .setExpirationTime(`${MFA_CHALLENGE_TTL_SEC}s`)
    .sign(getKey("staff"));
  (await cookies()).set({
    name: MFA_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/api/auth",
    maxAge: MFA_CHALLENGE_TTL_SEC,
  });
}

export async function readMfaChallenge(): Promise<{ userId: string; stage: MfaStage } | null> {
  const token = (await cookies()).get(MFA_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getKey("staff"), {
      issuer: ISSUER,
      audience: MFA_AUDIENCE,
      algorithms: ["HS256"],
    });
    if (typeof payload.sub !== "string" || (payload.stage !== "enroll" && payload.stage !== "verify")) return null;
    return { userId: payload.sub, stage: payload.stage };
  } catch {
    return null;
  }
}

export async function clearMfaChallenge() {
  (await cookies()).set({ name: MFA_COOKIE, value: "", httpOnly: true, sameSite: "strict", path: "/api/auth", maxAge: 0 });
}

/** Konto z bieżącego tokenu "MFA w toku" — tylko gdy etap się zgadza. */
export async function challengedUser(stage: MfaStage) {
  const challenge = await readMfaChallenge();
  if (!challenge || challenge.stage !== stage) return null;
  return await prisma.user.findUnique({ where: { id: challenge.userId } });
}

/** Kończy logowanie po potwierdzonym drugim składniku: nowa, pełna sesja. */
export async function completeMfaLogin(user: Pick<User, "id" | "login">, method: "TOTP" | "RECOVERY_CODE" | "PASSKEY") {
  await clearMfaChallenge();
  await startStaffSession(user.id, method);
  await logAudit({
    actorId: user.id,
    action: "LOGIN",
    entity: "User",
    entityId: user.id,
    summary: `Logowanie do panelu (konto „${user.login}", drugi składnik: ${MFA_METHOD_LABELS[method]})`,
    data: { mfaMethod: method },
  });
}

export const MFA_METHOD_LABELS: Record<string, string> = {
  TOTP: "aplikacja uwierzytelniająca",
  RECOVERY_CODE: "kod odzyskiwania",
  PASSKEY: "klucz dostępu",
};

export function mfaChallengeExpired() {
  return NextResponse.json(
    { ok: false, code: "MFA_CHALLENGE_EXPIRED", message: "Sesja logowania wygasła. Zaloguj się ponownie." },
    { status: 401 },
  );
}

/**
 * Odpowiedź po poprawnym haśle: ustawia token "MFA w toku" i mówi przeglądarce,
 * czy trzeba skonfigurować MFA (pierwsze logowanie), czy podać kod.
 */
export async function respondMfaRequired(user: Pick<User, "id" | "mfaEnabledAt">) {
  const stage: MfaStage = user.mfaEnabledAt ? "verify" : "enroll";
  await issueMfaChallenge(user.id, stage);
  const passkeys = stage === "verify" ? await prisma.webAuthnPasskey.count({ where: { userId: user.id } }) : 0;
  return NextResponse.json(
    {
      ok: false,
      code: stage === "enroll" ? "MFA_ENROLL_REQUIRED" : "MFA_REQUIRED",
      stage,
      methods: { totp: stage === "verify", passkey: passkeys > 0 },
      message:
        stage === "enroll"
          ? "Skonfiguruj logowanie dwuskładnikowe, aby kontynuować."
          : "Podaj kod z aplikacji uwierzytelniającej.",
    },
    { status: 200 },
  );
}

// --- Kody odzyskiwania ----------------------------------------------------

// Bez znaków łatwych do pomylenia (0/O, 1/I/L).
const RECOVERY_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function normalizeRecoveryCode(code: string) {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Generuje nowy komplet kodów (poprzednie przestają działać). Zwraca kody jawnie — do pokazania RAZ. */
export async function regenerateRecoveryCodes(userId: string): Promise<string[]> {
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const raw = Array.from({ length: 10 }, () => RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)]).join("");
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
  await prisma.$transaction([
    prisma.mfaRecoveryCode.deleteMany({ where: { userId } }),
    prisma.mfaRecoveryCode.createMany({
      data: codes.map((code) => ({ userId, codeHash: keyedHash(normalizeRecoveryCode(code)) })),
    }),
  ]);
  return codes;
}

// --- Weryfikacja drugiego składnika ---------------------------------------

export type SecondFactorInput = { code?: string; recoveryCode?: string };

type VerifyResult =
  | { ok: true; method: "TOTP" | "RECOVERY_CODE" }
  | { ok: false; response: NextResponse };

/**
 * Weryfikuje kod TOTP albo jednorazowy kod odzyskiwania — z limitem prób
 * per konto i per IP oraz zapisem do dziennika. Nie tworzy sesji.
 */
export async function verifySecondFactor(
  user: Pick<User, "id" | "login" | "name" | "mfaTotpSecretEnc" | "mfaTotpLastStep">,
  input: SecondFactorInput,
  context: string,
): Promise<VerifyResult> {
  const ipLimit = await hitRateLimit(RATE_LIMITS.mfaIp, await clientIp());
  if (!ipLimit.allowed) return { ok: false, response: tooManyRequests(ipLimit) };
  const accountLimit = await peekRateLimit(RATE_LIMITS.mfaAccount, user.id);
  if (!accountLimit.allowed) {
    return {
      ok: false,
      response: tooManyRequests(
        accountLimit,
        `Zbyt wiele błędnych kodów. Spróbuj ponownie za ${Math.ceil(accountLimit.retryAfterSec / 60)} min.`,
      ),
    };
  }

  let method: "TOTP" | "RECOVERY_CODE" | null = null;

  if (input.code && user.mfaTotpSecretEnc) {
    const step = verifyTotp(openSecret(user.mfaTotpSecretEnc), input.code, { lastUsedStep: user.mfaTotpLastStep });
    if (step !== null) {
      // Warunek na lastStep chroni przed równoległym użyciem tego samego kodu.
      const updated = await prisma.user.updateMany({
        where: {
          id: user.id,
          OR: [{ mfaTotpLastStep: null }, { mfaTotpLastStep: { lt: step } }],
        },
        data: { mfaTotpLastStep: step },
      });
      if (updated.count === 1) method = "TOTP";
    }
  } else if (input.recoveryCode) {
    const normalized = normalizeRecoveryCode(input.recoveryCode);
    const used = await prisma.mfaRecoveryCode.updateMany({
      where: { userId: user.id, usedAt: null, codeHash: { in: keyedHashCandidates(normalized) } },
      data: { usedAt: new Date() },
    });
    if (used.count === 1) method = "RECOVERY_CODE";
  }

  if (!method) {
    const failures = await hitRateLimit(RATE_LIMITS.mfaAccount, user.id);
    await logAudit({
      actor: { type: "GUEST", name: user.name, contact: user.login },
      action: "MFA_FAILED",
      entity: "User",
      entityId: user.id,
      summary: `Błędny kod drugiego składnika (${context}) dla konta „${user.login}"`,
      data: { context, kind: input.recoveryCode ? "recovery_code" : "totp", failures: failures.count },
    });
    await failureDelay(failures.count);
    return {
      ok: false,
      response: NextResponse.json({ ok: false, message: "Nieprawidłowy lub już wykorzystany kod" }, { status: 401 }),
    };
  }

  await resetRateLimit(RATE_LIMITS.mfaAccount, user.id);
  if (method === "RECOVERY_CODE") {
    const remaining = await prisma.mfaRecoveryCode.count({ where: { userId: user.id, usedAt: null } });
    await logAudit({
      actorId: user.id,
      action: "MFA_RECOVERY_USED",
      entity: "User",
      entityId: user.id,
      summary: `Użyto jednorazowego kodu odzyskiwania (${context}); pozostało ${remaining}`,
      data: { context, remaining },
    });
  }
  return { ok: true, method };
}

// --- Step-up: ponowne MFA przed operacją wysokiego ryzyka ------------------

/**
 * Wymaga, żeby bieżąca sesja potwierdziła MFA w ciągu ostatnich 10 minut.
 * Przeglądarka (components/security-fetch.tsx) po kodzie STEP_UP_REQUIRED
 * pyta o kod, woła /api/auth/step-up i automatycznie ponawia żądanie.
 */
export function requireStepUp(user: Pick<AuthUser, "stepUpAt">): NextResponse | null {
  if (user.stepUpAt && Date.now() - user.stepUpAt.getTime() < STEP_UP_WINDOW_MS) return null;
  return NextResponse.json(
    {
      ok: false,
      code: "STEP_UP_REQUIRED",
      message: "Ta operacja wymaga ponownego potwierdzenia kodem z aplikacji uwierzytelniającej.",
    },
    { status: 403 },
  );
}

// --- Reset MFA (procedura administracyjna) ---------------------------------

/** Usuwa wszystkie składniki MFA konta i unieważnia jego sesje. */
export async function resetUserMfa(userId: string) {
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        mfaEnabledAt: null,
        mfaTotpSecretEnc: null,
        mfaTotpPendingSecretEnc: null,
        mfaTotpLastStep: null,
        webauthnChallenge: null,
        webauthnChallengeExpiresAt: null,
      },
    }),
    prisma.mfaRecoveryCode.deleteMany({ where: { userId } }),
    prisma.webAuthnPasskey.deleteMany({ where: { userId } }),
  ]);
  return await revokeAllStaffSessions(userId, "mfa_reset");
}
