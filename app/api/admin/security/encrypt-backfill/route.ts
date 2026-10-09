import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { requireStepUp } from "@/lib/mfa";
import { ENCRYPTED_FIELDS, ENCRYPTED_PREFIX, encryptField } from "@/lib/data-encryption";
import { BLIND_COLUMNS, blindIndex, type BlindField } from "@/lib/blind-index";

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
  retailSale: "RetailSale",
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

// Pacjenci, którzy mają zaszyfrowane imię/telefon/e-mail, ale nie mają jeszcze skrótu do wyszukiwania.
const BLIND_FIELDS = Object.keys(BLIND_COLUMNS) as BlindField[];
function missingBlindWhere() {
  return Prisma.sql`("name" <> '' AND "nameHash" IS NULL) OR ("email" <> '' AND "emailHash" IS NULL) OR ("phone" <> '' AND "phoneHash" IS NULL)`;
}

async function countMissingBlind() {
  const rows = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count FROM "Patient" WHERE ${missingBlindWhere()}`;
  return Number(rows[0]?.count ?? 0);
}

async function fillBlindIndexes(limit: number) {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "Patient" WHERE ${missingBlindWhere()} LIMIT ${limit}`;
  let filled = 0;
  for (const row of rows) {
    const patient = await prisma.patient.findUnique({ where: { id: row.id }, select: { name: true, email: true, phone: true } });
    if (!patient) continue;
    for (const field of BLIND_FIELDS) {
      const hash = blindIndex(field, patient[field]);
      const column = Prisma.raw(`"${BLIND_COLUMNS[field]}"`);
      await prisma.$executeRaw`UPDATE "Patient" SET ${column} = ${hash} WHERE "id" = ${row.id}`;
    }
    filled++;
  }
  return filled;
}

async function remaining() {
  let total = await countMissingBlind();
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

  // Skróty do wyszukiwania pacjentów (po zaszyfrowaniu imienia, telefonu, e-maila).
  if (encrypted < BATCH) encrypted += await fillBlindIndexes(BATCH - encrypted);

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
