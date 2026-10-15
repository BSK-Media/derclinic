import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { loadRfm } from "@/lib/rfm-data";
import { requireAuth, requireStrictRole } from "@/lib/api-helpers";
import {
  RFM_SEGMENT_LABELS,
  RFM_SEGMENT_ORDER,
  type RfmSegment,
} from "@/lib/rfm";

export const dynamic = "force-dynamic";

// Analiza RFM pacjentów: dane o wartości pacjenta widzą tylko administrator i manager.
// Liczone są zakończone, zaakceptowane i nieusunięte wizyty oraz sprzedaż detaliczna przypisana do pacjenta
// (te same kryteria co w statystykach pacjenta).
export async function GET(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN", "MANAGER"]);
  if (deny) return deny;

  const url = new URL(req.url);
  const patientId = url.searchParams.get("patientId");
  const segmentParam = url.searchParams.get("segment");
  const segment = RFM_SEGMENT_ORDER.includes(segmentParam as RfmSegment) ? (segmentParam as RfmSegment) : "VIP";

  const { settings, scored } = await loadRfm(user!.locationScopeId);

  if (patientId) {
    const one = scored.find((r) => r.patientId === patientId);
    return NextResponse.json({
      ok: true,
      windowDays: settings.windowDays,
      rfm: one
        ? {
            r: one.r,
            f: one.f,
            m: one.m,
            segment: one.segment,
            label: RFM_SEGMENT_LABELS[one.segment].label,
            hint: RFM_SEGMENT_LABELS[one.segment].hint,
            daysSince: one.daysSince,
            frequency: one.frequency,
            monetary: one.monetary,
          }
        : null,
    });
  }

  const segments = RFM_SEGMENT_ORDER.map((key) => ({
    segment: key,
    label: RFM_SEGMENT_LABELS[key].label,
    hint: RFM_SEGMENT_LABELS[key].hint,
    count: scored.filter((r) => r.segment === key).length,
    monetary: scored.filter((r) => r.segment === key).reduce((sum, r) => sum + r.monetary, 0),
  }));

  const listed = scored
    .filter((r) => r.segment === segment)
    .sort((a, b) => b.monetary - a.monetary)
    .slice(0, 100);
  const patients = listed.length
    ? await prisma.patient.findMany({
        where: { id: { in: listed.map((r) => r.patientId) } },
        select: { id: true, name: true },
      })
    : [];
  const names = new Map(patients.map((p) => [p.id, p.name]));

  return NextResponse.json({
    ok: true,
    windowDays: settings.windowDays,
    total: scored.length,
    segments,
    segment,
    patients: listed.map((r) => ({
      id: r.patientId,
      name: names.get(r.patientId) ?? "—",
      r: r.r,
      f: r.f,
      m: r.m,
      daysSince: r.daysSince,
      frequency: r.frequency,
      monetary: r.monetary,
    })),
  });
}
