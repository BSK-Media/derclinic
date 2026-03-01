import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/api-helpers";

export async function GET(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;

  // Admin can preview specialist panel
  const deny = requireRole(user!.role, ["SPECIALIST", "ADMIN"]);
  if (deny) return deny;

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const specialistIdParam = url.searchParams.get("specialistId");

  const fromDt = from ? new Date(from) : new Date(Date.now() - 1000 * 60 * 60 * 24 * 7);
  const toDt = to ? new Date(to) : new Date(Date.now() + 1000 * 60 * 60 * 24 * 14);

  const specialistId = user!.role === "ADMIN" && specialistIdParam ? specialistIdParam : user!.id;

  const appointments = await prisma.appointment.findMany({
    where: { specialistId, startsAt: { gte: fromDt, lt: toDt } },
    orderBy: { startsAt: "asc" },
    include: { patient: true, service: true },
    take: 500,
  });

  return NextResponse.json({ ok: true, appointments });
}
