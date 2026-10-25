import type { Prisma, PrismaClient } from "@prisma/client";
import { logAudit } from "@/lib/audit";

type Db = PrismaClient | Prisma.TransactionClient;

export function normalizePhone(value: string) {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return trimmed;
  return trimmed.startsWith("+") ? `+${digits}` : digits;
}

/**
 * Szybkie założenie kartoteki klienta (np. przy sprzedaży pakietu lub vouchera). Ten sam numer telefonu w tej samej
 * lokalizacji = ten sam klient: zamiast duplikatu zwracamy istniejącą kartotekę (uzupełniając brakujący e-mail).
 */
export async function findOrCreatePatientByPhone(
  db: Db,
  input: { name: string; phone: string; email?: string | null; locationId: string; actorId: string; context: string },
) {
  const name = input.name.replace(/\s+/g, " ").trim();
  const phone = normalizePhone(input.phone);
  const email = input.email?.trim() || null;

  const existing = await db.patient.findFirst({
    where: { phone, locationId: input.locationId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, phone: true, email: true },
  });
  if (existing) {
    if (email && !existing.email) {
      await db.patient.update({ where: { id: existing.id }, data: { email } });
      await logAudit({
        actorId: input.actorId,
        action: "UPDATE",
        entity: "Patient",
        entityId: existing.id,
        summary: `Uzupełnienie adresu e-mail pacjenta ${input.context}: ${email}`,
        data: { changes: { email: { from: null, to: email } } },
      });
    }
    return { patient: { id: existing.id, name: existing.name, phone: existing.phone }, created: false };
  }

  const created = await db.patient.create({
    data: { name, phone, email, locationId: input.locationId },
    select: { id: true, name: true, phone: true },
  });
  await logAudit({
    actorId: input.actorId,
    action: "CREATE",
    entity: "Patient",
    entityId: created.id,
    summary: `Nowa karta pacjenta ${input.context}: ${name} (${phone})`,
    data: { name, phone, email, locationId: input.locationId },
  });
  return { patient: created, created: true };
}
