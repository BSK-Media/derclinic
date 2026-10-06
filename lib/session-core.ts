import { createHash, randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";
import { getKey } from "@/lib/auth-keys";

// Rdzeń sesji po stronie serwera (audyt F-07, F-08, F-15) — bez zależności od
// next/headers, żeby używać go zarówno w proxy.ts, jak i w API/komponentach.
//
// Token w ciasteczku zawiera wyłącznie: iss, aud, sub (id konta), sid (losowy
// identyfikator sesji), jti, iat, exp. Żadnych danych kontaktowych ani ról —
// rola i uprawnienia są za każdym razem czytane z bazy, więc ich zmiana działa
// natychmiast. W bazie przechowujemy tylko SHA-256 identyfikatora sesji.

export const ISSUER = "derclinic";
export const STAFF_AUDIENCE = "derclinic:staff";
export const PATIENT_AUDIENCE = "derclinic:patient";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const SESSION_POLICY = {
  // Personel: sesja wygasa po 12 h, a po 2 h bezczynności wymaga ponownego logowania.
  staff: { absoluteMs: 12 * HOUR, idleMs: 2 * HOUR },
  // Pacjent: do 30 dni, wylogowanie po 7 dniach bez aktywności.
  patient: { absoluteMs: 30 * DAY, idleMs: 7 * DAY },
} as const;

// lastSeenAt odświeżamy co najwyżej raz na 5 minut (mniej zapisów do bazy).
const TOUCH_INTERVAL_MS = 5 * MINUTE;

export function hashSessionId(sid: string) {
  return createHash("sha256").update(sid).digest("hex");
}

export function newSessionId() {
  return randomBytes(32).toString("base64url");
}

export async function signSessionToken(kind: "staff" | "patient", subject: string, sid: string, expiresAt: Date) {
  return await new SignJWT({ sid })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setAudience(kind === "staff" ? STAFF_AUDIENCE : PATIENT_AUDIENCE)
    .setSubject(subject)
    .setJti(randomBytes(16).toString("base64url"))
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(getKey(kind));
}

async function readToken(kind: "staff" | "patient", token: string) {
  try {
    const { payload } = await jwtVerify(token, getKey(kind), {
      issuer: ISSUER,
      audience: kind === "staff" ? STAFF_AUDIENCE : PATIENT_AUDIENCE,
      algorithms: ["HS256"],
    });
    if (typeof payload.sub !== "string" || typeof payload.sid !== "string") return null;
    return { subject: payload.sub, sid: payload.sid };
  } catch {
    return null;
  }
}

function isActive(
  session: { revokedAt: Date | null; expiresAt: Date; lastSeenAt: Date },
  idleMs: number,
  now = Date.now(),
) {
  return !session.revokedAt && session.expiresAt.getTime() > now && session.lastSeenAt.getTime() + idleMs > now;
}

const staffUserSelect = {
  id: true,
  login: true,
  email: true,
  name: true,
  role: true,
  sidebarPermissions: true,
  mfaEnabledAt: true,
  // Czy konto jest wspólne (ma operatorów z PIN-em) — wtedy sesja czeka na PIN.
  operators: { select: { id: true }, take: 1 },
} as const;

export async function validateStaffToken(token: string | undefined | null) {
  if (!token) return null;
  const parsed = await readToken("staff", token);
  if (!parsed) return null;

  const session = await prisma.staffSession.findUnique({
    where: { id: hashSessionId(parsed.sid) },
    include: { user: { select: staffUserSelect }, operator: { select: { id: true, name: true } } },
  });
  if (!session || session.userId !== parsed.subject) return null;
  if (!isActive(session, SESSION_POLICY.staff.idleMs)) return null;
  // Konto bez aktywnego MFA nie może mieć pełnej sesji (np. po resecie MFA).
  if (!session.user.mfaEnabledAt) return null;

  if (Date.now() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await prisma.staffSession
      .update({ where: { id: session.id }, data: { lastSeenAt: new Date() } })
      .catch(() => {});
  }
  // Konto wspólne: sesja jest pełna dopiero po podaniu PIN-u osoby przy komputerze.
  // PIN-y dotyczą wyłącznie kont recepcji: po zmianie roli (np. z powrotem na
  // administratora) osoby zostają w bazie, ale konto przestaje ich wymagać
  // i nie pokazuje ich w panelu.
  const usesOperators = session.user.role === "RECEPTION";
  const operatorPending = usesOperators && !session.operatorId && session.user.operators.length > 0;
  return { ...session, operator: usesOperators ? session.operator : null, operatorPending };
}

/**
 * Imię osoby wybranej PIN-em w sesji z ciasteczka (konto wspólne) — do
 * podpisywania wpisów dziennika. Bez sprawdzania aktywności sesji; zwraca
 * null, gdy token jest nieczytelny, sesja jest cudza albo nie ma operatora.
 */
export async function sessionOperatorName(token: string | undefined | null, userId: string) {
  if (!token) return null;
  const parsed = await readToken("staff", token);
  if (!parsed || parsed.subject !== userId) return null;
  const session = await prisma.staffSession.findUnique({
    where: { id: hashSessionId(parsed.sid) },
    select: { userId: true, operator: { select: { name: true } }, user: { select: { role: true } } },
  });
  if (!session || session.userId !== userId || session.user.role !== "RECEPTION") return null;
  return session.operator?.name ?? null;
}

export async function validatePatientToken(token: string | undefined | null) {
  if (!token) return null;
  const parsed = await readToken("patient", token);
  if (!parsed) return null;

  const session = await prisma.patientSession.findUnique({
    where: { id: hashSessionId(parsed.sid) },
    include: { patient: { select: { id: true, name: true, phone: true, email: true } } },
  });
  if (!session || session.patientId !== parsed.subject) return null;
  if (!isActive(session, SESSION_POLICY.patient.idleMs)) return null;

  if (Date.now() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await prisma.patientSession
      .update({ where: { id: session.id }, data: { lastSeenAt: new Date() } })
      .catch(() => {});
  }
  return session;
}

/** Unieważnia wszystkie aktywne sesje pracownika (np. po zmianie hasła, roli, resecie MFA). */
export async function revokeAllStaffSessions(userId: string, reason: string, exceptSessionId?: string) {
  const result = await prisma.staffSession.updateMany({
    where: { userId, revokedAt: null, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
  return result.count;
}

export async function revokeAllPatientSessions(patientId: string, reason: string, exceptSessionId?: string) {
  const result = await prisma.patientSession.updateMany({
    where: { patientId, revokedAt: null, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
  return result.count;
}

/** Sprzątanie wygasłych sesji (wołane okazjonalnie przy logowaniu). */
export async function purgeExpiredSessions() {
  const cutoff = new Date(Date.now() - 30 * DAY);
  await Promise.all([
    prisma.staffSession.deleteMany({ where: { expiresAt: { lt: cutoff } } }),
    prisma.patientSession.deleteMany({ where: { expiresAt: { lt: cutoff } } }),
  ]).catch(() => {});
}
