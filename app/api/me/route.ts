import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-cookie";
import { prisma } from "@/lib/db";
import { normalizeSidebarPermissions } from "@/lib/sidebar-permissions";

export async function GET() {
  const u = await getAuthUser();
  if (!u) return NextResponse.json({ ok: false }, { status: 401 });

  // Refresh from DB (role changes etc.)
  const dbu = await prisma.user.findUnique({
    where: { id: u.id },
    include: { assignedLocation: { select: { id: true, name: true } } },
  });
  if (!dbu) return NextResponse.json({ ok: false }, { status: 401 });

  const sidebarPermissions = normalizeSidebarPermissions(dbu.role, dbu.sidebarPermissions);

  // Rola i uprawnienia są czytane z bazy przy każdym żądaniu (sesja po stronie
  // serwera), więc nie trzeba już odświeżać tokenu.
  return NextResponse.json({
    ok: true,
    user: { id: dbu.id, login: dbu.login, name: dbu.name, role: dbu.role, payoutPercent: dbu.payoutPercent, avatarUrl: dbu.avatarUrl, jobTitle: dbu.jobTitle, location: dbu.assignedLocation.name, locationId: dbu.locationId, assignedLocation: dbu.assignedLocation, specialization: dbu.specialization, sidebarPermissions },
  });
}
