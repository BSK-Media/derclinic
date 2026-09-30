import { cookies, headers } from "next/headers";
import { randomBytes, createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import {
  SESSION_POLICY,
  hashSessionId,
  newSessionId,
  signSessionToken,
  validatePatientToken,
} from "@/lib/session-core";

// Sesja pacjenta jest całkowicie osobna od sesji personelu (lib/auth-cookie.ts):
// inne ciasteczko, inny klucz podpisu (PATIENT_AUTH_SECRET), inna tabela sesji.
// Dzięki temu panel klienta nie koliduje z logowaniem do DerClinic OS —
// można być jednocześnie zalogowanym jako pracownik i jako pacjent.

export type PatientAuthUser = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  sessionId: string;
};

const COOKIE_NAME = "derclinic_patient_session";
// Dawne ciasteczko z 30-dniowym, bezstanowym JWT.
const LEGACY_COOKIE_NAME = "derclinic_patient";

export const PATIENT_AUTH_COOKIE_NAME = COOKIE_NAME;

function cookieOptions(maxAgeSec: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSec,
  };
}

export async function getPatientAuth(): Promise<PatientAuthUser | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  const session = await validatePatientToken(token);
  if (!session) return null;
  return { ...session.patient, sessionId: session.id };
}

/** Tworzy nową sesję pacjenta (po poprawnym logowaniu / rejestracji / resecie hasła). */
export async function startPatientSession(patientId: string) {
  const sid = newSessionId();
  const expiresAt = new Date(Date.now() + SESSION_POLICY.patient.absoluteMs);
  let meta: { ipAddress: string | null; userAgent: string | null } = { ipAddress: null, userAgent: null };
  try {
    const h = await headers();
    const ip = h.get("x-real-ip")?.trim() || h.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
    meta = { ipAddress: ip?.slice(0, 64) ?? null, userAgent: h.get("user-agent")?.slice(0, 300) ?? null };
  } catch {}
  await prisma.patientSession.create({
    data: { id: hashSessionId(sid), patientId, expiresAt, ...meta },
  });
  const jar = await cookies();
  jar.set({
    name: COOKIE_NAME,
    value: await signSessionToken("patient", patientId, sid, expiresAt),
    ...cookieOptions(SESSION_POLICY.patient.absoluteMs / 1000),
  });
  jar.set({ name: LEGACY_COOKIE_NAME, value: "", ...cookieOptions(0) });
}

/** Wylogowanie pacjenta: unieważnia bieżącą sesję i czyści ciasteczko. */
export async function endPatientSession(reason = "logout") {
  const current = await getPatientAuth();
  if (current) {
    await prisma.patientSession.updateMany({
      where: { id: current.sessionId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }
  const jar = await cookies();
  jar.set({ name: COOKIE_NAME, value: "", ...cookieOptions(0) });
  jar.set({ name: LEGACY_COOKIE_NAME, value: "", ...cookieOptions(0) });
  return current;
}

// --- Reset hasła ---
// Token wysyłany w linku e-mail to losowy, wysokiej entropii ciąg znaków.
// W bazie trzymamy tylko jego hash (SHA-256) — tak jak hasła, nigdy nie
// zapisujemy sekretu w postaci jawnej. Sam token nie musi być bcryptowany
// (nie jest to hasło wybrane przez człowieka, więc nie grozi mu brute-force
// ze słownika) — wystarczy szybki, deterministyczny hash do porównania.
export function generatePasswordResetToken() {
  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  return { token, tokenHash };
}

export function hashPasswordResetToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 godzina
