import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { getAuthUser } from "@/lib/auth-cookie";
import { prisma } from "@/lib/db";
import {
  hasSidebarPermission,
  normalizeSidebarPermissions,
  SIDEBAR_PERMISSION_KEYS,
  type SidebarPermission,
} from "@/lib/sidebar-permissions";

export async function requireAuth() {
  const u = await getAuthUser();
  if (!u) return { user: null, error: NextResponse.json({ ok: false, message: "Brak autoryzacji" }, { status: 401 }) };

  const dbUser = await prisma.user.findUnique({
    where: { id: u.id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      locationId: true,
      assignedLocation: { select: { id: true, name: true, isActive: true } },
      sidebarPermissions: true,
    },
  });
  if (!dbUser) {
    return { user: null, error: NextResponse.json({ ok: false, message: "Brak autoryzacji" }, { status: 401 }) };
  }

  const sidebarPermissions = normalizeSidebarPermissions(dbUser.role, dbUser.sidebarPermissions);
  let locationScopeId: string | null = dbUser.locationId;
  if (dbUser.role === "ADMIN") {
    const requestedLocationId = cookies().get("bsk_location_scope")?.value ?? "all";
    if (requestedLocationId === "all") {
      locationScopeId = null;
    } else {
      const requestedLocation = await prisma.location.findFirst({
        where: { id: requestedLocationId, isActive: true },
        select: { id: true },
      });
      locationScopeId = requestedLocation?.id ?? null;
    }
  }
  const requestedPermission = headers().get("x-bsk-sidebar-permission");
  const isKnownPermission = SIDEBAR_PERMISSION_KEYS.includes(requestedPermission as SidebarPermission);

  if (
    requestedPermission &&
    (!isKnownPermission || !hasSidebarPermission(dbUser.role, sidebarPermissions, requestedPermission as SidebarPermission))
  ) {
    return { user: null, error: NextResponse.json({ ok: false, message: "Brak uprawnień" }, { status: 403 }) };
  }

  return {
    user: {
      id: dbUser.id,
      email: dbUser.email ?? "",
      name: dbUser.name,
      role: dbUser.role,
      locationId: dbUser.locationId,
      assignedLocation: dbUser.assignedLocation,
      locationScopeId,
      sidebarPermissions,
    },
    error: null,
  };
}

export function scopedLocationWhere(user: { locationScopeId: string | null }) {
  return user.locationScopeId ? { locationId: user.locationScopeId } : {};
}

export function requireRole(userRole: string, allowed: string[]) {
  if (headers().get("x-bsk-sidebar-permission")) return null;

  if (!allowed.includes(userRole)) {
    return NextResponse.json({ ok: false, message: "Brak uprawnień" }, { status: 403 });
  }
  return null;
}

export function requireStrictRole(userRole: string, allowed: string[]) {
  if (!allowed.includes(userRole)) {
    return NextResponse.json({ ok: false, message: "Brak uprawnień" }, { status: 403 });
  }
  return null;
}
