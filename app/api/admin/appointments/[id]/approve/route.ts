import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";

const BodySchema = z
  .object({
    action: z.enum(["APPROVE", "REJECT"]).default("APPROVE"),
    // Powód odrzucenia — wymagany przy odrzucaniu wizyty
    reason: z.string().trim().max(500).optional().or(z.literal("")),
  })
  .superRefine((value, ctx) => {
    if (value.action === "REJECT" && (!value.reason || value.reason.trim().length < 3)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reason"],
        message: "Podaj powód odrzucenia wizyty",
      });
    }
  });

// Akceptacja lub odrzucenie zakończonej wizyty. Tylko recepcja i administrator —
// lekarz nie może zatwierdzić własnej wizyty (specjalistów blokuje też middleware
// dla całej ścieżki /api/admin/appointments).
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN", "RECEPTION"]);
  if (deny) return deny;

  const json = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(json ?? {});
  if (!parsed.success)
    return NextResponse.json(
      { ok: false, message: parsed.error.issues[0]?.message ?? "Niepoprawne dane" },
      { status: 400 },
    );

  const target = parsed.data.action === "REJECT" ? "REJECTED" : "APPROVED";

  const appt = await prisma.appointment.findUnique({
    where: { id: params.id },
    select: { id: true, status: true, approvalStatus: true },
  });
  if (!appt)
    return NextResponse.json({ ok: false, message: "Nie znaleziono wizyty" }, { status: 404 });
  if (appt.status !== "COMPLETED") {
    return NextResponse.json(
      {
        ok: false,
        message: "Można zaakceptować lub odrzucić wyłącznie zakończoną wizytę.",
      },
      { status: 400 },
    );
  }
  if (appt.approvalStatus === target) {
    return NextResponse.json(
      {
        ok: false,
        message:
          target === "APPROVED"
            ? "Ta wizyta jest już zaakceptowana."
            : "Ta wizyta jest już odrzucona.",
      },
      { status: 400 },
    );
  }

  const updated = await prisma.appointment.update({
    where: { id: params.id },
    data: {
      approvalStatus: target,
      approvedAt: new Date(),
      approvedById: user!.id,
      rejectionReason: target === "REJECTED" ? parsed.data.reason!.trim() : null,
    },
  });

  await logAudit({
    actorId: user!.id,
    action: "UPDATE",
    entity: "AppointmentApproval",
    entityId: updated.id,
    data: {
      approvalStatus: target,
      rejectionReason: target === "REJECTED" ? parsed.data.reason!.trim() : null,
    },
  });

  return NextResponse.json({ ok: true, appointment: updated });
}
