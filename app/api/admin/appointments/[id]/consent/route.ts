import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole } from "@/lib/api-helpers";

// Stan zgody na zabieg przy wizycie (dla personelu): status, powód ostatniego
// odrzucenia i lista złożonych plików (bez samej zawartości).
export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN", "MANAGER", "RECEPTION"]);
  if (deny) return deny;

  const appointment = await prisma.appointment.findFirst({
    where: { id: params.id, deletedAt: null, ...(user!.locationScopeId ? { locationId: user!.locationScopeId } : {}) },
    select: {
      consentStatus: true,
      consentSignedAt: true,
      consentRejectionReason: true,
      consentForfeitedAt: true,
      startsAt: true,
      consentSubmissions: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          createdAt: true,
          fileName: true,
          size: true,
          status: true,
          reason: true,
          details: true,
          decidedBy: { select: { name: true } },
        },
      },
    },
  });
  if (!appointment) return NextResponse.json({ ok: false, message: "Nie znaleziono wizyty" }, { status: 404 });

  return NextResponse.json({
    ok: true,
    status: appointment.consentStatus,
    signedAt: appointment.consentSignedAt,
    rejectionReason: appointment.consentRejectionReason,
    forfeited: Boolean(appointment.consentForfeitedAt),
    deadline: appointment.startsAt,
    submissions: appointment.consentSubmissions.map((s) => ({
      id: s.id,
      createdAt: s.createdAt,
      fileName: s.fileName,
      size: s.size,
      status: s.status,
      reason: s.reason,
      details: s.details,
      decidedBy: s.decidedBy?.name ?? null,
    })),
  });
}
