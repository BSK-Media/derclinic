import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { requireStepUp } from "@/lib/mfa";
import { ENCRYPTED_FIELDS, ENCRYPTED_PREFIX, encryptField } from "@/lib/data-encryption";

// Jednorazowe zaszyfrowanie danych zapisanych przed wdrożeniem szyfrowania
// (zdjęcia z wizyt, notatki). Nowe dane są szyfrowane automatycznie
// (lib/prisma.ts). Działa porcjami, żeby nie przekroczyć limitu czasu funkcji;
// przeglądarka woła POST aż do remaining = 0. Surowy UPDATE nie zmienia
// updatedAt, więc nie generuje fałszywych "zmian wizyt".

const TABLES = {
  appointment: "Appointment",
  noteVersion: "NoteVersion",
  patient: "Patient",
  consumption: "Consumption",
} as const;
const BATCH = 25;

type Model = keyof typeof ENCRYPTED_FIELDS;

async function countPlain(model: Model, field: string) {
  const table = Prisma.raw(`"${TABLES[model]}"`);
  const column = Prisma.raw(`"${field}"`);
  const rows = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count FROM ${table}
    WHERE ${column} IS NOT NULL AND ${column} <> '' AND ${column} NOT LIKE ${ENCRYPTED_PREFIX + "%"}`;
  return Number(rows[0]?.count ?? 0);
}

async function remaining() {
  let total = 0;
  for (const [model, fields] of Object.entries(ENCRYPTED_FIELDS) as [Model, readonly string[]][]) {
    for (const field of fields) total += await countPlain(model, field);
  }
  return total;
}

async function guard() {
  const { user, error } = await requireAuth();
  if (error) return { error };
  const deny = requireStrictRole(user!.role, ["ADMIN"]);
  if (deny) return { error: deny };
  return { user: user! };
}

export async function GET() {
  const auth = await guard();
  if (auth.error) return auth.error;
  return NextResponse.json({ ok: true, remaining: await remaining() });
}

export async function POST() {
  const auth = await guard();
  if (auth.error) return auth.error;
  const stepUp = requireStepUp(auth.user);
  if (stepUp) return stepUp;

  let encrypted = 0;
  outer: for (const [model, fields] of Object.entries(ENCRYPTED_FIELDS) as [Model, readonly string[]][]) {
    const table = Prisma.raw(`"${TABLES[model]}"`);
    for (const field of fields) {
      const column = Prisma.raw(`"${field}"`);
      const rows = await prisma.$queryRaw<{ id: string; value: string }[]>`
        SELECT "id", ${column} AS value FROM ${table}
        WHERE ${column} IS NOT NULL AND ${column} <> '' AND ${column} NOT LIKE ${ENCRYPTED_PREFIX + "%"}
        LIMIT ${BATCH}`;
      for (const row of rows) {
        await prisma.$executeRaw`UPDATE ${table} SET ${column} = ${encryptField(row.value)} WHERE "id" = ${row.id} AND ${column} = ${row.value}`;
        encrypted++;
      }
      if (encrypted >= BATCH) break outer;
    }
  }

  const left = await remaining();
  if (encrypted > 0) {
    await logAudit({
      actorId: auth.user.id,
      action: "UPDATE",
      entity: "Security",
      summary: `Zaszyfrowano ${encrypted} pól z danymi medycznymi zapisanych przed wdrożeniem szyfrowania (pozostało ${left})`,
      data: { encrypted, remaining: left },
    });
  }
  return NextResponse.json({ ok: true, encrypted, remaining: left });
}
