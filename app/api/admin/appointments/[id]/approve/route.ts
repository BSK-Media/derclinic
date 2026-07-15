import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";

const BodySchema = z.object({
  action: z.enum(["APPROVE", "REJECT"]).default("APPROVE"),
});

// Akceptacja lub odrzucenie wizyty wpisanej przez lekarza. Tylko recepcja i administrator —
// lekarz nie może zatwierdzić własnej wizyty (specjalistów blokuje też middleware
// dla całej ścieżki /api/admin/appointments).
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireRole(user!.role, ["ADMIN", "RECEPTION"]);
  if (deny) return deny;

  const json = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(json ?? {});
  if (!parsed.success) return NextResponse.json({ ok: false, message: "Niepoprawne dane" }, { status: 400 });

  const target = parsed.data.action === "REJECT" ? "REJECTED" : "APPROVED";

  const appt = await prisma.appointment.findUnique({
    where: { id: params.id },
    select: { id: true, approvalStatus: true },
  });
  if (!appt) return NextResponse.json({ ok: false, message: "Nie znaleziono wizyty" }, { status: 404 });
  if (appt.approvalStatus === target) {
    return NextResponse.json(
      { ok: false, message: target === "APPROVED" ? "Ta wizyta jest już zaakceptowana." : "Ta wizyta jest już odrzucona." },
      { status: 400 },
    );
  }

  const updated = await prisma.appointment.update({
    where: { id: params.id },
    data: {
      approvalStatus: target,
      approvedAt: new Date(),
      approvedById: user!.id,
    },
  });

  await logAudit({
    actorId: user!.id,
    action: "UPDATE",
    entity: "AppointmentApproval",
    entityId: updated.id,
    data: { approvalStatus: target },
  });

  return NextResponse.json({ ok: true, appointment: updated });
}
