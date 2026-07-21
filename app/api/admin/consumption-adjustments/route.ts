import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/api-helpers";

export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const pending = await prisma.consumption.findMany({
    where: {
      status: "PENDING",
      ...(user!.locationScopeId
        ? {
            OR: [
              { appointment: { locationId: user!.locationScopeId } },
              { warehouse: { locationId: user!.locationScopeId } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      product: true,
      specialist: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      appointment: { include: { patient: true, service: true } },
    },
  });

  return NextResponse.json({ ok: true, adjustments: pending });
}
