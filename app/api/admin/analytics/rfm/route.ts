import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getRfmSettings } from "@/lib/rfm-settings";
import { requireAuth, requireStrictRole, scopedLocationWhere } from "@/lib/api-helpers";
import {
  RFM_SEGMENT_LABELS,
  RFM_SEGMENT_ORDER,
  computeRfm,
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

  const now = new Date();
  const settings = await getRfmSettings();
  const windowStart = new Date(now.getTime() - settings.windowDays * 24 * 3600 * 1000);
  const scope = scopedLocationWhere(user!);

  const [appointments, sales] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        status: "COMPLETED",
        approvalStatus: "APPROVED",
        deletedAt: null,
        service: { name: { not: "__DERCLINIC_REZERWACJA_CZASU__" } },
        patient: { ...scope },
        ...scope,
      },
      select: { patientId: true, startsAt: true, priceFinal: true, priceEstimate: true },
      take: 100000,
    }),
    prisma.retailSale.findMany({
      where: { status: "COMPLETED", patientId: { not: null }, ...scope },
      select: { patientId: true, createdAt: true, total: true },
      take: 100000,
    }),
  ]);

  const agg = new Map<string, { lastAt: Date; frequency: number; monetary: number }>();
  const add = (id: string, at: Date, amount: number) => {
    const cur = agg.get(id) ?? { lastAt: at, frequency: 0, monetary: 0 };
    if (at > cur.lastAt) cur.lastAt = at;
    if (at >= windowStart) {
      cur.frequency += 1;
      cur.monetary += amount;
    }
    agg.set(id, cur);
  };
  for (const a of appointments) add(a.patientId, a.startsAt, a.priceFinal ?? a.priceEstimate ?? 0);
  for (const s of sales) if (s.patientId) add(s.patientId, s.createdAt, s.total);

  const scored = computeRfm(
    [...agg.entries()].map(([id, v]) => ({ patientId: id, ...v })),
    now,
    { thresholds: settings.thresholds },
  );

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
