import { NextResponse } from "next/server";
import { PATIENT_PUBLIC_SELECT } from "@/lib/patient-select";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/api-helpers";

export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = await requireRole(user!.role, ["ADMIN"]);
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
      appointment: { include: { patient: { select: PATIENT_PUBLIC_SELECT }, service: true } },
    },
  });

  return NextResponse.json({ ok: true, adjustments: pending });
}
