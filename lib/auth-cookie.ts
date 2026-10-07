import { cookies, headers } from "next/headers";
import { normalizeSidebarPermissions, type SidebarPermission } from "@/lib/sidebar-permissions";
import { prisma } from "@/lib/prisma";
import {
  SESSION_POLICY,
  hashSessionId,
  newSessionId,
  purgeExpiredSessions,
  signSessionToken,
  validateStaffToken,
} from "@/lib/session-core";

export type Role = "ADMIN" | "MANAGER" | "RECEPTION" | "SPECIALIST";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  sidebarPermissions: SidebarPermission[];
  // Sesja po stronie serwera (hash identyfikatora) i czas ostatniego step-up MFA.
  sessionId: string;
  stepUpAt: Date | null;
  // Konto wspólne (recepcja): osoba wybrana PIN-em po zalogowaniu.
  operatorId: string | null;
  operatorName: string | null;
  // Administrator, który wszedł na to konto (sesja "zalogowano jako").
  impersonatedBy: { id: string; name: string } | null;
};

const COOKIE_NAME = "bsk_session";
// Dawne ciasteczko z 30-dniowym, bezstanowym JWT — czyścimy je przy logowaniu/wylogowaniu.
const LEGACY_COOKIE_NAME = "bsk_auth";
// Token własnej sesji administratora, odłożony na czas wejścia na cudze konto.
const ADMIN_RETURN_COOKIE = "bsk_admin_return";

export const AUTH_COOKIE_NAME = COOKIE_NAME;

function cookieOptions(maxAgeSec: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSec,
  };
}

/**
 * Sesja pracownika z ciasteczka — także ta, która czeka jeszcze na PIN
 * (operatorPending). Do obsługi ekranu PIN i wylogowania; do reszty służy getAuthUser.
 */
export async function getStaffSession() {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  return await validateStaffToken(token);
}

export async function getAuthUser(): Promise<AuthUser | null> {
  const session = await getStaffSession();
  if (!session) return null;
  // Konto wspólne bez podanego PIN-u nie ma dostępu do niczego poza ekranem PIN.
  if (session.operatorPending) return null;
  const { user } = session;
  const impersonator = session.impersonatedById
    ? await prisma.user.findUnique({ where: { id: session.impersonatedById }, select: { id: true, name: true } })
    : null;
  return {
    id: user.id,
    email: user.email ?? `${user.login}@local`,
    name: user.name,
    role: user.role as Role,
    sidebarPermissions: normalizeSidebarPermissions(user.role, user.sidebarPermissions),
    sessionId: session.id,
    stepUpAt: session.stepUpAt,
    operatorId: session.operator?.id ?? null,
    operatorName: session.operator?.name ?? null,
    impersonatedBy: impersonator,
  };
}

async function requestMeta() {
  try {
    const h = await headers();
    const ip = h.get("x-real-ip")?.trim() || h.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
    return { ipAddress: ip?.slice(0, 64) ?? null, userAgent: h.get("user-agent")?.slice(0, 300) ?? null };
  } catch {
    return { ipAddress: null, userAgent: null };
  }
}

/**
 * Tworzy pełną sesję pracownika — wolno wołać WYŁĄCZNIE po potwierdzeniu
 * hasła i drugiego składnika (MFA). Za każdym razem nowy identyfikator sesji.
 */
export async function startStaffSession(userId: string, mfaMethod: "TOTP" | "RECOVERY_CODE" | "PASSKEY") {
  const sid = newSessionId();
  const now = Date.now();
  const expiresAt = new Date(now + SESSION_POLICY.staff.absoluteMs);
  await prisma.staffSession.create({
    data: {
      id: hashSessionId(sid),
      userId,
      expiresAt,
      mfaMethod,
      // Świeże logowanie z MFA liczy się jako step-up.
      stepUpAt: new Date(now),
      ...(await requestMeta()),
    },
  });
  const jar = await cookies();
  jar.set({ name: COOKIE_NAME, value: await signSessionToken("staff", userId, sid, expiresAt), ...cookieOptions(SESSION_POLICY.staff.absoluteMs / 1000) });
  jar.set({ name: LEGACY_COOKIE_NAME, value: "", ...cookieOptions(0) });
  if (Math.random() < 0.05) void purgeExpiredSessions();
}

/** Wylogowanie: unieważnia bieżącą sesję w bazie i czyści ciasteczko. */
export async function endStaffSession(reason = "logout") {
  // Raw session: wylogować trzeba także sesję czekającą na PIN.
  const current = await getStaffSession();
  if (current) {
    await prisma.staffSession.updateMany({
      where: { id: current.id, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }
  const jar = await cookies();
  jar.set({ name: COOKIE_NAME, value: "", ...cookieOptions(0) });
  jar.set({ name: LEGACY_COOKIE_NAME, value: "", ...cookieOptions(0) });
  jar.set({ name: ADMIN_RETURN_COOKIE, value: "", ...cookieOptions(0) });
  return current ? { id: current.userId, operatorName: current.operator?.name ?? null } : null;
}

/**
 * Administrator wchodzi na konto innego pracownika. Własna sesja administratora
 * zostaje nietknięta (jej token ląduje w osobnym ciasteczku httpOnly), a docelowe
 * konto dostaje krótką, osobną sesję oznaczoną id administratora.
 */
export async function startImpersonation(adminId: string, targetUserId: string) {
  const jar = await cookies();
  const adminToken = jar.get(COOKIE_NAME)?.value;
  if (!adminToken) throw new Error("Brak sesji administratora");

  const sid = newSessionId();
  const expiresAt = new Date(Date.now() + SESSION_POLICY.impersonation.absoluteMs);
  await prisma.staffSession.create({
    data: {
      id: hashSessionId(sid),
      userId: targetUserId,
      expiresAt,
      mfaMethod: "IMPERSONATION",
      stepUpAt: null,
      impersonatedById: adminId,
      ...(await requestMeta()),
    },
  });
  jar.set({ name: ADMIN_RETURN_COOKIE, value: adminToken, ...cookieOptions(SESSION_POLICY.staff.absoluteMs / 1000) });
  jar.set({
    name: COOKIE_NAME,
    value: await signSessionToken("staff", targetUserId, sid, expiresAt),
    ...cookieOptions(SESSION_POLICY.impersonation.absoluteMs / 1000),
  });
}

/** Kończy wejście na cudze konto i przywraca sesję administratora. Null, gdy to nie sesja "jako". */
export async function stopImpersonation() {
  const jar = await cookies();
  const current = await getStaffSession();
  if (!current?.impersonatedById) return null;
  const returnToken = jar.get(ADMIN_RETURN_COOKIE)?.value;
  const adminSession = await validateStaffToken(returnToken);
  const restored = Boolean(
    returnToken && adminSession && adminSession.userId === current.impersonatedById && adminSession.user.role === "ADMIN",
  );

  await prisma.staffSession.updateMany({
    where: { id: current.id, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: "impersonation_end" },
  });
  jar.set({ name: ADMIN_RETURN_COOKIE, value: "", ...cookieOptions(0) });
  if (restored && returnToken) {
    jar.set({ name: COOKIE_NAME, value: returnToken, ...cookieOptions(SESSION_POLICY.staff.absoluteMs / 1000) });
  } else {
    jar.set({ name: COOKIE_NAME, value: "", ...cookieOptions(0) });
  }
  return { adminId: current.impersonatedById, targetId: current.userId, restored };
}
