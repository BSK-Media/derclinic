import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { reconcileLoyaltyPointsForAppointment, resolveAppointmentPrice } from "@/lib/loyalty";

// Jednorazowa (ale bezpieczna do wielokrotnego uruchomienia) synchronizacja
// punktów lojalnościowych dla WSZYSTKICH historycznych wizyt, które spełniają
// wszystkie trzy warunki programu: zakończona, w pełni opłacona i
// zaakceptowana. Dolicza tylko brakujące punkty (nigdy nie odbiera) — patrz
// reconcileLoyaltyPointsForAppointment w lib/loyalty.ts.
export async function POST() {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const appointments = await prisma.appointment.findMany({
    where: { status: "COMPLETED", approvalStatus: "APPROVED", deletedAt: null },
    select: {
      id: true,
      patientId: true,
      priceFinal: true,
      priceEstimate: true,
      service: { select: { price: true } },
      payments: { select: { amount: true } },
    },
  });

  let appointmentsFixed = 0;
  let pointsAdded = 0;
  let skippedUnpaid = 0;

  for (const appt of appointments) {
    const price = resolveAppointmentPrice(appt);
    const paid = appt.payments.reduce((sum, p) => sum + p.amount, 0);
    if (paid < price) {
      skippedUnpaid++;
      continue;
    }
    const added = await prisma.$transaction((tx) => reconcileLoyaltyPointsForAppointment(tx, appt));
    if (added > 0) {
      appointmentsFixed++;
      pointsAdded += added;
    }
  }

  if (pointsAdded > 0) {
    await logAudit({
      actorId: user!.id,
      action: "UPDATE",
      entity: "LoyaltyBackfill",
      entityId: "bulk",
      data: {
        appointmentsScanned: appointments.length,
        appointmentsFixed,
        pointsAdded,
        skippedUnpaid,
      },
    });
  }

  return NextResponse.json({
    ok: true,
    appointmentsScanned: appointments.length,
    appointmentsFixed,
    pointsAdded,
    skippedUnpaid,
  });
}
