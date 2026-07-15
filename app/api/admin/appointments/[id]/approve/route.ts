import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";

// Akceptacja wizyty wpisanej przez lekarza. Tylko recepcja i administrator —
// lekarz nie może zaakceptować własnej wizyty (specjalistów blokuje też middleware
// dla całej ścieżki /api/admin/appointments).
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireRole(user!.role, ["ADMIN", "RECEPTION"]);
  if (deny) return deny;

  const appt = await prisma.appointment.findUnique({
    where: { id: params.id },
    select: { id: true, approvalStatus: true },
  });
  if (!appt) return NextResponse.json({ ok: false, message: "Nie znaleziono wizyty" }, { status: 404 });
  if (appt.approvalStatus === "APPROVED") {
    return NextResponse.json({ ok: false, message: "Ta wizyta jest już zaakceptowana." }, { status: 400 });
  }

  const updated = await prisma.appointment.update({
    where: { id: params.id },
    data: {
      approvalStatus: "APPROVED",
      approvedAt: new Date(),
      approvedById: user!.id,
    },
  });

  await logAudit({
    actorId: user!.id,
    action: "UPDATE",
    entity: "AppointmentApproval",
    entityId: updated.id,
    data: { approvalStatus: "APPROVED" },
  });

  return NextResponse.json({ ok: true, appointment: updated });
}
