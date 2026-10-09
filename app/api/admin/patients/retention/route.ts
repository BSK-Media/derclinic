import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { MEDICAL_RETENTION_YEARS, medicalRetentionEnd } from "@/lib/retention";

// Karty pacjentów do brakowania (L-12): dokumentacja, której okres przechowywania
// (20 lat od końca roku ostatniego wpisu) już minął. Lista jest tylko podglądem —
// usunięcie karty odbywa się na jej stronie (wymaga MFA i zostaje w dzienniku zdarzeń).
export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  // Ostatni wpis dokumentacji per pacjent — takie same kryteria jak blokada usuwania karty.
  const rows = await prisma.appointment.groupBy({
    by: ["patientId"],
    where: {
      service: { name: { not: "__DERCLINIC_REZERWACJA_CZASU__" } },
      OR: [
        { status: "COMPLETED" },
        { consumptions: { some: {} } },
        { photoBefore: { not: null } },
        { photoAfter: { not: null } },
      ],
    },
    _max: { startsAt: true },
    _count: { _all: true },
  });

  const now = Date.now();
  const expired = rows.filter((r) => r._max.startsAt && medicalRetentionEnd(r._max.startsAt).getTime() < now);
  const patients = expired.length
    ? await prisma.patient.findMany({
        where: { id: { in: expired.map((r) => r.patientId) } },
        select: { id: true, name: true },
      })
    : [];
  const names = new Map(patients.map((p) => [p.id, p.name]));

  const items = expired
    .map((r) => ({
      patientId: r.patientId,
      name: names.get(r.patientId) ?? "—",
      lastEntry: r._max.startsAt!,
      retentionEnd: medicalRetentionEnd(r._max.startsAt!),
      appointments: r._count._all,
    }))
    .filter((item) => names.has(item.patientId))
    .sort((a, b) => a.lastEntry.getTime() - b.lastEntry.getTime());

  await logAudit({
    actorId: user!.id,
    action: "READ",
    entity: "Patient",
    entityId: "retention",
    summary: `Przegląd kart do brakowania (okres ${MEDICAL_RETENTION_YEARS} lat): ${items.length}`,
  });

  return NextResponse.json({ ok: true, years: MEDICAL_RETENTION_YEARS, items });
}
