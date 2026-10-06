import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/api-helpers";

// Lista próśb klientów o cofnięcie zgody na wizerunek — dla recepcji i admina.
// Decyzje podejmuje POST /api/admin/image-consent-requests/[id]/decide.
export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = await requireRole(user!.role, ["ADMIN", "RECEPTION"]);
  if (deny) return deny;

  const requests = await prisma.imageConsentRevocationRequest.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      patient: { select: { id: true, name: true, phone: true, email: true } },
      appointment: {
        select: { id: true, startsAt: true, customServiceName: true, imageConsent: true, service: { select: { name: true } } },
      },
      decidedBy: { select: { name: true } },
    },
  });

  return NextResponse.json({
    ok: true,
    requests: requests.map(({ appointment, ...rest }) => ({
      ...rest,
      appointment: {
        id: appointment.id,
        startsAt: appointment.startsAt,
        serviceName: appointment.customServiceName || appointment.service.name,
        imageConsent: appointment.imageConsent,
      },
    })),
  });
}
