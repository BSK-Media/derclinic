import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole } from "@/lib/api-helpers";

// Historia punktów jednego klienta (ostatnie 50 operacji) — do okna ze szczegółami.
export async function GET(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN", "MANAGER"]);
  if (deny) return deny;

  const patientId = new URL(req.url).searchParams.get("patientId");
  if (!patientId) return NextResponse.json({ ok: false, message: "Brak klienta" }, { status: 400 });

  const patient = await prisma.patient.findFirst({
    where: { id: patientId, ...(user!.locationScopeId ? { locationId: user!.locationScopeId } : {}) },
    select: { id: true, name: true, loyaltyPoints: true },
  });
  if (!patient) return NextResponse.json({ ok: false, message: "Nie znaleziono klienta" }, { status: 404 });

  const rows = await prisma.loyaltyPointsTransaction.findMany({
    where: { patientId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      createdAt: true,
      type: true,
      points: true,
      note: true,
      appointment: { select: { customServiceName: true, service: { select: { name: true } } } },
    },
  });

  return NextResponse.json({
    ok: true,
    patient,
    history: rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt,
      type: row.type,
      points: row.points,
      note: row.note,
      serviceName: row.appointment ? row.appointment.customServiceName || row.appointment.service.name : null,
    })),
  });
}
