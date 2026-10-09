import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

// Notatki (wizyty, pacjenta) są edytowalne, ale poprzednia treść nie może po cichu zniknąć —
// przy każdej zmianie zapisujemy ją jako wersję (zaszyfrowaną aplikacyjnie jak oryginał,
// patrz ENCRYPTED_FIELDS w lib/data-encryption.ts).
export async function recordNoteVersion(
  db: Db,
  entity: "APPOINTMENT" | "PATIENT",
  entityId: string,
  previousNote: string | null | undefined,
  nextNote: string | null | undefined,
  changedById: string,
) {
  const before = (previousNote ?? "").trim();
  const after = (nextNote ?? "").trim();
  if (!before || before === after) return;
  await db.noteVersion.create({ data: { entity, entityId, note: before, createdById: changedById } });
}
