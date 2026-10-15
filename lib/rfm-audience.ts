import { prisma } from "@/lib/db";
import { RFM_SEGMENT_ORDER, type RfmSegment } from "@/lib/rfm";
import { loadRfm } from "@/lib/rfm-data";

export function isRfmSegment(value: unknown): value is RfmSegment {
  return typeof value === "string" && (RFM_SEGMENT_ORDER as string[]).includes(value);
}

/** Pacjenci należący teraz do segmentu (opcjonalnie tylko z jednej lokalizacji). */
export async function patientIdsInSegment(segment: RfmSegment, locationScopeId: string | null): Promise<string[]> {
  const { scored } = await loadRfm(locationScopeId);
  return scored.filter((r) => r.segment === segment).map((r) => r.patientId);
}

/** Mapa pacjent → segment, do oznaczania pacjentów na listach. */
export async function segmentByPatient(locationScopeId: string | null): Promise<Map<string, RfmSegment>> {
  const { scored } = await loadRfm(locationScopeId);
  return new Map(scored.map((r) => [r.patientId, r.segment]));
}

/**
 * Do kogo można wysłać powiadomienie push do segmentu: pacjenci z segmentu, z włączonymi powiadomieniami,
 * ze zgodą marketingową, bez ograniczenia przetwarzania i z aktywnym kontem.
 */
export async function pushRecipientIdsForSegment(segment: RfmSegment, locationScopeId: string | null): Promise<string[]> {
  const ids = await patientIdsInSegment(segment, locationScopeId);
  return eligiblePushIds(ids);
}

async function eligiblePushIds(ids: string[]): Promise<string[]> {
  if (!ids.length) return [];
  const rows = await prisma.patient.findMany({
    where: {
      id: { in: ids },
      accountDeletedAt: null,
      processingRestrictedAt: null,
      pushSubscriptions: { some: {} },
      consents: { some: { type: "MARKETING", granted: true } },
    },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/** Ilu pacjentów z każdego segmentu faktycznie dostanie powiadomienie push. */
export async function pushRecipientCountsBySegment(locationScopeId: string | null): Promise<Record<RfmSegment, number>> {
  const { scored } = await loadRfm(locationScopeId);
  const eligible = new Set(await eligiblePushIds(scored.map((r) => r.patientId)));
  const counts = Object.fromEntries(RFM_SEGMENT_ORDER.map((s) => [s, 0])) as Record<RfmSegment, number>;
  for (const r of scored) if (eligible.has(r.patientId)) counts[r.segment] += 1;
  return counts;
}
