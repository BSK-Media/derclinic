import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { getAuthUser, type AuthUser } from "@/lib/auth-cookie";
import { normalizeSidebarPermissions } from "@/lib/sidebar-permissions";

export const IMPERSONATE_COOKIE_NAME = "bsk_impersonate";

export type EffectiveAuth = {
  user: AuthUser | null;
  adminUser: AuthUser | null;
  impersonating: boolean;
};

/**
 * Returns the effective user for the request.
 * - normally: user == adminUser == token user
 * - when admin is impersonating: user == target user, adminUser == original admin
 */
export async function getEffectiveAuth(): Promise<EffectiveAuth> {
  const adminUser = await getAuthUser();
  if (!adminUser) return { user: null, adminUser: null, impersonating: false };

  const targetId = (await cookies()).get(IMPERSONATE_COOKIE_NAME)?.value;
  if (!targetId || adminUser.role !== "ADMIN") {
    return { user: adminUser, adminUser, impersonating: false };
  }

  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true, email: true, name: true, role: true, sidebarPermissions: true },
  });

  if (!target) {
    // stale cookie
    return { user: adminUser, adminUser, impersonating: false };
  }

  return {
    user: {
      id: target.id,
      email: target.email ?? "",
      name: target.name ?? "",
      role: target.role,
      sidebarPermissions: normalizeSidebarPermissions(target.role, target.sidebarPermissions),
    },
    adminUser,
    impersonating: true,
  };
}

export async function clearImpersonationCookie() {
  (await cookies()).set({
    name: IMPERSONATE_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}
export async function setImpersonationCookie(userId: string) {
  (await cookies()).set({
    name: IMPERSONATE_COOKIE_NAME,
    value: userId,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24,
  });
}
