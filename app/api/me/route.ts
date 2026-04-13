import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-cookie";
import { prisma } from "@/lib/db";

export async function GET() {
  const u = await getAuthUser();
  if (!u) return NextResponse.json({ ok: false }, { status: 401 });

  // Refresh from DB (role changes etc.)
  const dbu = await prisma.user.findUnique({ where: { id: u.id } });
  if (!dbu) return NextResponse.json({ ok: false }, { status: 401 });

  return NextResponse.json({
    ok: true,
    user: { id: dbu.id, login: dbu.login, name: dbu.name, role: dbu.role, payoutPercent: dbu.payoutPercent, avatarUrl: dbu.avatarUrl, jobTitle: dbu.jobTitle },
  });
}
