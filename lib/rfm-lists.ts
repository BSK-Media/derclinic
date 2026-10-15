import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { RFM_SEGMENT_LABELS, RFM_SEGMENT_ORDER, type RfmSegment } from "@/lib/rfm";
import { loadRfm } from "@/lib/rfm-data";

// Automatyczne listy odbiorców newslettera według segmentów RFM. Każdy segment (poza „Pozostali”) ma
// własną listę; skład jest przeliczany: pacjent, który zmienił segment, znika z poprzedniej listy
// i pojawia się w nowej. Pacjent bez wizyt ani zakupów nie trafia na żadną listę.

export const RFM_LIST_SEGMENTS: RfmSegment[] = RFM_SEGMENT_ORDER.filter((s) => s !== "OTHER");

export function rfmListName(segment: RfmSegment) {
  return `RFM · ${RFM_SEGMENT_LABELS[segment].label}`;
}

/** Różnica między składem obecnym a docelowym. */
export function diffMembership(current: string[], target: string[]) {
  const cur = new Set(current);
  const tgt = new Set(target);
  return {
    add: target.filter((id) => !cur.has(id)),
    remove: current.filter((id) => !tgt.has(id)),
  };
}

export type RfmListSyncResult = { segment: RfmSegment; total: number; added: number; removed: number };

export async function syncRfmLists(actorId?: string | null): Promise<RfmListSyncResult[]> {
  const { scored } = await loadRfm(null);
  const bySegment = new Map<RfmSegment, string[]>();
  for (const r of scored) {
    const arr = bySegment.get(r.segment) ?? [];
    arr.push(r.patientId);
    bySegment.set(r.segment, arr);
  }

  const results: RfmListSyncResult[] = [];
  for (const segment of RFM_LIST_SEGMENTS) {
    const name = rfmListName(segment);
    const list = await prisma.newsletterList.upsert({
      where: { rfmSegment: segment },
      create: { name, rfmSegment: segment },
      update: { name },
      select: { id: true },
    });
    const current = (
      await prisma.newsletterListMember.findMany({ where: { listId: list.id }, select: { patientId: true } })
    ).map((m) => m.patientId);
    const target = bySegment.get(segment) ?? [];
    const { add, remove } = diffMembership(current, target);
    if (add.length) {
      await prisma.newsletterListMember.createMany({
        data: add.map((patientId) => ({ listId: list.id, patientId })),
        skipDuplicates: true,
      });
    }
    if (remove.length) {
      await prisma.newsletterListMember.deleteMany({ where: { listId: list.id, patientId: { in: remove } } });
    }
    results.push({ segment, total: target.length, added: add.length, removed: remove.length });
  }

  const changed = results.filter((r) => r.added || r.removed);
  if (changed.length) {
    await logAudit({
      ...(actorId ? { actorId } : { actor: { type: "SYSTEM" as const, name: "Listy newslettera RFM" } }),
      action: "UPDATE",
      entity: "NewsletterList",
      entityId: "rfm",
      summary: `Przeliczono listy newslettera wg segmentów RFM: ${changed
        .map((r) => `${RFM_SEGMENT_LABELS[r.segment].label} (+${r.added}/−${r.removed})`)
        .join(", ")}`,
    });
  }
  return results;
}

/** Przelicza listy automatyczne, jeśli wśród wybranych list jest choć jedna taka. */
export async function syncRfmListsIfSelected(listIds: string[], actorId?: string | null) {
  if (!listIds.length) return;
  const auto = await prisma.newsletterList.count({ where: { id: { in: listIds }, rfmSegment: { not: null } } });
  if (auto > 0) await syncRfmLists(actorId);
}
