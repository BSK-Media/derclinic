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
  const SORTS = ["name", "rfm", "daysSince", "frequency", "monetary"] as const;
  type Sort = (typeof SORTS)[number];
  const requestedSort = url.searchParams.get("sort") as Sort | null;
  const sort: Sort = requestedSort && SORTS.includes(requestedSort) ? requestedSort : "monetary";
  const dir = url.searchParams.get("dir") === "asc" ? "asc" : "desc";
  const requestedSize = Number(url.searchParams.get("pageSize"));
  const pageSize = [25, 50, 100].includes(requestedSize) ? requestedSize : 50;

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

  const inSegment = scored.filter((r) => r.segment === segment);
  // Nazwiska są zaszyfrowane w bazie — do sortowania po nazwie pobieramy je dla całego segmentu, w pozostałych
  // przypadkach tylko dla bieżącej strony.
  const nameOf = new Map<string, string>();
  if (sort === "name" && inSegment.length) {
    const all = await prisma.patient.findMany({ where: { id: { in: inSegment.map((r) => r.patientId) } }, select: { id: true, name: true } });
    for (const p of all) nameOf.set(p.id, p.name);
  }
  const sign = dir === "asc" ? 1 : -1;
  const rfmKey = (r: { r: number; f: number; m: number }) => r.r * 100 + r.f * 10 + r.m;
  inSegment.sort((x, y) => {
    let result: number;
    if (sort === "name") result = (nameOf.get(x.patientId) ?? "").localeCompare(nameOf.get(y.patientId) ?? "", "pl", { sensitivity: "base" });
    else if (sort === "rfm") result = rfmKey(x) - rfmKey(y);
    else if (sort === "daysSince") result = x.daysSince - y.daysSince;
    else if (sort === "frequency") result = x.frequency - y.frequency;
    else result = x.monetary - y.monetary;
    return result !== 0 ? result * sign : x.patientId.localeCompare(y.patientId);
  });

  const total = inSegment.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, Number(url.searchParams.get("page")) || 1), pageCount);
  const listed = inSegment.slice((page - 1) * pageSize, page * pageSize);
  if (sort !== "name" && listed.length) {
    const rows = await prisma.patient.findMany({ where: { id: { in: listed.map((r) => r.patientId) } }, select: { id: true, name: true } });
    for (const p of rows) nameOf.set(p.id, p.name);
  }
  const names = nameOf;

  return NextResponse.json({
    ok: true,
    windowDays: settings.windowDays,
    total: scored.length,
    segments,
    segment,
    segmentTotal: total,
    page,
    pageSize,
    pageCount,
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
