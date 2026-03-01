import { NextResponse } from "next/server";
import { type Role, getAuthUser } from "@/lib/auth-cookie";
import { getEffectiveAuth } from "@/lib/effective-auth";

export async function requireSession() {
  const { user } = await getEffectiveAuth();
  if (!user?.id) {
    return { ok: false as const, response: NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }) };
  }
  return { ok: true as const, user };
}

export async function requireRole(roles: Role[]) {
  const res = await requireSession();
  if (!res.ok) return res;
  if (!roles.includes(res.user.role)) {
    return { ok: false as const, response: NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }) };
  }
  return { ok: true as const, user: res.user, role: res.user.role };
}

/**
 * Requires that the *token user* is an admin (ignores impersonation).
 * Use this for endpoints that manage impersonation itself.
 */
export async function requireAdminToken() {
  const u = await getAuthUser();
  if (!u?.id) {
    return { ok: false as const, response: NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }) };
  }
  if (u.role !== "ADMIN") {
    return { ok: false as const, response: NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }) };
  }
  return { ok: true as const, user: u, role: u.role };
}
