import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { subscribedPatientWhere } from "@/lib/newsletter-recipients";

const PatchSchema = z.object({
  name: z.string().trim().min(2, "Podaj nazwę listy (min. 2 znaki)").max(80).optional(),
  addPatientIds: z.array(z.string().min(1).max(100)).max(1000).optional(),
  removePatientIds: z.array(z.string().min(1).max(100)).max(1000).optional(),
});

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN", "MANAGER"]);
  if (deny) return deny;

  const list = await prisma.newsletterList.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      name: true,
      members: {
        select: { patient: { select: { id: true, name: true, email: true, phone: true } } },
      },
    },
  });
  if (!list) return bad("Nie znaleziono listy", 404);
  // Imię pacjenta jest zaszyfrowane — sortowanie alfabetyczne w pamięci.
  list.members.sort((a, b) => a.patient.name.localeCompare(b.patient.name, "pl", { sensitivity: "base" }));

  const subscribedIds = new Set(
    (
      await prisma.patient.findMany({
        where: { id: { in: list.members.map((m) => m.patient.id) }, ...subscribedPatientWhere(null) },
        select: { id: true },
      })
    ).map((p) => p.id),
  );

  return NextResponse.json({
    ok: true,
    list: {
      id: list.id,
      name: list.name,
      members: list.members.map((m) => ({ ...m.patient, subscribed: subscribedIds.has(m.patient.id) })),
    },
  });
}

// Zmiana nazwy listy oraz dodawanie / usuwanie klientów.
export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN", "MANAGER"]);
  if (deny) return deny;

  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad(parsed.error.issues[0]?.message ?? "Niepoprawne dane");

  const list = await prisma.newsletterList.findUnique({ where: { id: params.id }, select: { id: true, name: true } });
  if (!list) return bad("Nie znaleziono listy", 404);

  const { name, addPatientIds, removePatientIds } = parsed.data;
  let added = 0;
  if (name !== undefined) await prisma.newsletterList.update({ where: { id: list.id }, data: { name } });
  if (addPatientIds?.length) {
    // Tylko istniejący klienci (manager — tylko ze swojej lokalizacji).
    const valid = await prisma.patient.findMany({
      where: { id: { in: addPatientIds }, ...(user!.locationScopeId ? { locationId: user!.locationScopeId } : {}) },
      select: { id: true },
    });
    const result = await prisma.newsletterListMember.createMany({
      data: valid.map((p) => ({ listId: list.id, patientId: p.id })),
      skipDuplicates: true,
    });
    added = result.count;
  }
  let removed = 0;
  if (removePatientIds?.length) {
    const result = await prisma.newsletterListMember.deleteMany({
      where: { listId: list.id, patientId: { in: removePatientIds } },
    });
    removed = result.count;
  }

  await logAudit({
    actorId: user!.id,
    action: "UPDATE",
    entity: "NewsletterList",
    entityId: list.id,
    summary: `Lista newslettera „${name ?? list.name}": ${[
      name !== undefined ? `zmiana nazwy (było „${list.name}")` : null,
      added ? `dodano klientów: ${added}` : null,
      removed ? `usunięto klientów: ${removed}` : null,
    ]
      .filter(Boolean)
      .join(", ") || "bez zmian"}`,
  });

  return NextResponse.json({ ok: true, added, removed });
}

export async function DELETE(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN", "MANAGER"]);
  if (deny) return deny;

  const list = await prisma.newsletterList.findUnique({ where: { id: params.id }, select: { id: true, name: true } });
  if (!list) return bad("Nie znaleziono listy", 404);

  await prisma.newsletterList.delete({ where: { id: list.id } });
  await logAudit({
    actorId: user!.id,
    action: "DELETE",
    entity: "NewsletterList",
    entityId: list.id,
    summary: `Usunięto listę newslettera „${list.name}"`,
  });
  return NextResponse.json({ ok: true });
}
