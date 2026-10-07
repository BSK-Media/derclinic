import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole } from "@/lib/api-helpers";

// Płatności zamówione przy rezerwacji online (BLIK / przelew): lista dla
// personelu. ?appointmentId=… zawęża do jednej wizyty. Potwierdzają
// administrator i manager (patrz decision); recepcja widzi listę.
export async function GET(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN", "MANAGER", "RECEPTION"]);
  if (deny) return deny;

  const url = new URL(req.url);
  const appointmentId = url.searchParams.get("appointmentId");

  const requests = await prisma.paymentRequest.findMany({
    where: {
      ...(appointmentId ? { appointmentId } : {}),
      appointment: user!.locationScopeId ? { locationId: user!.locationScopeId } : undefined,
    },
    orderBy: [{ createdAt: "desc" }],
    take: 300,
    select: {
      id: true,
      createdAt: true,
      claimedAt: true,
      decidedAt: true,
      status: true,
      amount: true,
      choice: true,
      method: true,
      reference: true,
      rejectionReason: true,
      decidedBy: { select: { name: true } },
      appointment: {
        select: {
          id: true,
          startsAt: true,
          status: true,
          customServiceName: true,
          service: { select: { name: true } },
          patient: { select: { id: true, name: true, phone: true } },
        },
      },
    },
  });

  return NextResponse.json({
    ok: true,
    canDecide: user!.role === "ADMIN" || user!.role === "MANAGER",
    requests: requests.map(({ appointment, ...rest }) => ({
      ...rest,
      appointment: {
        id: appointment.id,
        startsAt: appointment.startsAt,
        status: appointment.status,
        serviceName: appointment.customServiceName || appointment.service.name,
      },
      patient: appointment.patient,
    })),
  });
}
