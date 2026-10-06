import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/api-helpers";

// Lista próśb pacjentów o zmianę danych kontaktowych — widoczna dla recepcji
// i admina (patrz PatientDataChangeRequest w schema.prisma). Decyzje podejmuje
// POST /api/admin/patient-data-change-requests/[id]/decide.
export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = await requireRole(user!.role, ["ADMIN", "MANAGER", "RECEPTION"]);
  if (deny) return deny;

  const requests = await prisma.patientDataChangeRequest.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      patient: { select: { id: true, name: true, phone: true, email: true } },
      decidedBy: { select: { name: true } },
    },
  });

  return NextResponse.json({ ok: true, requests });
}
