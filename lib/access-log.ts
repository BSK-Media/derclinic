import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";

// Rejestr odczytów dokumentacji (kto otworzył kartę pacjenta, wizytę, zdjęcia) — rozliczalność
// dostępu do danych zdrowotnych. Żeby nie zapisywać wpisu przy każdym odświeżeniu, to samo
// otwarcie przez tę samą osobę w ciągu 30 minut liczy się raz.
const THROTTLE_MS = 30 * 60 * 1000;

export async function logRecordAccess(input: {
  actorId: string;
  entity: "Patient" | "Appointment" | "AppointmentPhoto";
  entityId: string;
  summary: string;
}) {
  try {
    const recent = await prisma.auditLog.findFirst({
      where: {
        action: "READ",
        entity: input.entity,
        entityId: input.entityId,
        actorId: input.actorId,
        createdAt: { gte: new Date(Date.now() - THROTTLE_MS) },
      },
      select: { id: true },
    });
    if (recent) return;
    await logAudit({
      actorId: input.actorId,
      action: "READ",
      entity: input.entity,
      entityId: input.entityId,
      summary: input.summary,
    });
  } catch {
    // Rejestr odczytów nie może blokować pracy z kartą.
  }
}
