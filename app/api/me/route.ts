import { NextResponse } from "next/server";
import { getAuthUser, setAuthCookie, signAuthToken } from "@/lib/auth-cookie";
import { prisma } from "@/lib/db";
import { normalizeSidebarPermissions } from "@/lib/sidebar-permissions";

export async function GET() {
  const u = await getAuthUser();
  if (!u) return NextResponse.json({ ok: false }, { status: 401 });

  // Refresh from DB (role changes etc.)
  const dbu = await prisma.user.findUnique({ where: { id: u.id } });
  if (!dbu) return NextResponse.json({ ok: false }, { status: 401 });

  const sidebarPermissions = normalizeSidebarPermissions(dbu.role, dbu.sidebarPermissions);

  // Odświeżamy token przy każdym wejściu do aplikacji, dzięki czemu zmiana
  // uprawnień wykonana przez administratora zaczyna obowiązywać po odświeżeniu.
  const token = await signAuthToken({
    id: dbu.id,
    email: dbu.email ?? `${dbu.login}@local`,
    name: dbu.name,
    role: dbu.role,
    sidebarPermissions,
  });
  setAuthCookie(token);

  return NextResponse.json({
    ok: true,
    user: { id: dbu.id, login: dbu.login, name: dbu.name, role: dbu.role, payoutPercent: dbu.payoutPercent, avatarUrl: dbu.avatarUrl, jobTitle: dbu.jobTitle, location: dbu.location, specialization: dbu.specialization, sidebarPermissions },
  });
}
