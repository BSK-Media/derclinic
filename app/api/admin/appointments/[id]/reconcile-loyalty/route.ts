import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole, scopedLocationWhere } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { reconcileLoyaltyPointsForAppointment } from "@/lib/loyalty";

// Doliczenie brakujących punktów lojalnościowych dla wizyty, która została już
// zaakceptowana wcześniej (np. zanim poprawiono cenę, albo przed naprawą
// liczenia ceny w akceptacji — patrz lib/loyalty.ts). Bezpieczne do wielokrotnego
// wywołania: nigdy nie odbiera punktów, dolicza tylko brakującą różnicę.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN", "RECEPTION"]);
  if (deny) return deny;

  const appt = await prisma.appointment.findFirst({
    where: { id: params.id, ...scopedLocationWhere(user!) },
    select: {
      id: true,
      status: true,
      approvalStatus: true,
      deletedAt: true,
      patientId: true,
      priceFinal: true,
      priceEstimate: true,
      service: { select: { price: true } },
    },
  });
  if (!appt || appt.deletedAt)
    return NextResponse.json({ ok: false, message: "Nie znaleziono wizyty" }, { status: 404 });
  if (appt.status !== "COMPLETED" || appt.approvalStatus !== "APPROVED") {
    return NextResponse.json(
      {
        ok: false,
        message: "Przeliczyć punkty można tylko dla zakończonej i zaakceptowanej wizyty.",
      },
      { status: 400 },
    );
  }

  const pointsAdded = await prisma.$transaction((tx) =>
    reconcileLoyaltyPointsForAppointment(tx, appt),
  );

  if (pointsAdded > 0) {
    await logAudit({
      actorId: user!.id,
      action: "UPDATE",
      entity: "AppointmentLoyaltyReconcile",
      entityId: appt.id,
      data: { pointsAdded },
    });
  }

  return NextResponse.json({ ok: true, pointsAdded });
}
