import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-cookie";

export async function requireAuth() {
  const u = await getAuthUser();
  if (!u) return { user: null, error: NextResponse.json({ ok: false, message: "Brak autoryzacji" }, { status: 401 }) };
  return { user: u, error: null };
}

export function requireRole(userRole: string, allowed: string[]) {
  if (!allowed.includes(userRole)) {
    return NextResponse.json({ ok: false, message: "Brak uprawnień" }, { status: 403 });
  }
  return null;
}
