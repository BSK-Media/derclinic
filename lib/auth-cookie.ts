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
};

const COOKIE_NAME = "bsk_session";
// Dawne ciasteczko z 30-dniowym, bezstanowym JWT — czyścimy je przy logowaniu/wylogowaniu.
const LEGACY_COOKIE_NAME = "bsk_auth";

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

export async function getAuthUser(): Promise<AuthUser | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  const session = await validateStaffToken(token);
  if (!session) return null;
  const { user } = session;
  return {
    id: user.id,
    email: user.email ?? `${user.login}@local`,
    name: user.name,
    role: user.role as Role,
    sidebarPermissions: normalizeSidebarPermissions(user.role, user.sidebarPermissions),
    sessionId: session.id,
    stepUpAt: session.stepUpAt,
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
  const current = await getAuthUser();
  if (current) {
    await prisma.staffSession.updateMany({
      where: { id: current.sessionId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }
  const jar = await cookies();
  jar.set({ name: COOKIE_NAME, value: "", ...cookieOptions(0) });
  jar.set({ name: LEGACY_COOKIE_NAME, value: "", ...cookieOptions(0) });
  return current;
}
