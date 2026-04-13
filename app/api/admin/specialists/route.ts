
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/api-helpers";

export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const specialists = await prisma.user.findMany({
    where: { OR: [{ role: "SPECIALIST" }, { role: "RECEPTION" }] },
    orderBy: [{ specialistCode: "asc" }, { name: "asc" }],
    select: {
      id: true,
      specialistCode: true,
      name: true,
      login: true,
      role: true,
      email: true,
      phone: true,
      isVisible: true,
      isAvailable: true,
      avatarUrl: true,
      jobTitle: true,
      sourceProfileUrl: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ ok: true, specialists });
}
