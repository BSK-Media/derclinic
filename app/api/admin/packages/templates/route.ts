import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const READ_ROLES = ["ADMIN", "MANAGER", "RECEPTION"];
// Katalog pakietów tworzy i zmienia administrator oraz manager.
const WRITE_ROLES = ["ADMIN", "MANAGER"];

// Katalog pakietów (szablony) oraz lista usług do wyboru (bez archiwalnych).
export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, READ_ROLES);
  if (deny) return deny;

  const [templates, services] = await Promise.all([
    prisma.packageTemplate.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      include: { service: { select: { name: true } } },
    }),
    prisma.service.findMany({
      where: { isArchived: false, name: { not: "__DERCLINIC_REZERWACJA_CZASU__" } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    services,
    templates: templates.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      serviceId: t.serviceId,
      serviceName: t.service?.name ?? null,
      sessions: t.sessions,
      price: t.price,
      validityDays: t.validityDays,
      isActive: t.isActive,
    })),
  });
}

const TemplateSchema = z.object({
  name: z.string().trim().min(2, "Podaj nazwę pakietu").max(120),
  description: z.string().trim().max(500).optional().nullable(),
  serviceId: z.string().min(1).max(100).optional().nullable(),
  sessions: z.number().int().min(1, "Liczba zabiegów musi wynosić co najmniej 1").max(200),
  // Cena w groszach.
  price: z.number().int().min(0).max(100_000_00),
  validityDays: z.number().int().min(1).max(3650).optional().nullable(),
  isActive: z.boolean().optional(),
});

export async function POST(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, WRITE_ROLES);
  if (deny) return deny;

  const parsed = TemplateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: parsed.error.issues[0]?.message ?? "Niepoprawne dane" }, { status: 400 });
  }
  const d = parsed.data;
  const template = await prisma.packageTemplate.create({
    data: {
      name: d.name,
      description: d.description || null,
      serviceId: d.serviceId || null,
      sessions: d.sessions,
      price: d.price,
      validityDays: d.validityDays ?? null,
      isActive: d.isActive ?? true,
    },
    select: { id: true },
  });
  await logAudit({
    actorId: user!.id,
    action: "CREATE",
    entity: "PackageTemplate",
    entityId: template.id,
    summary: `Nowy pakiet w katalogu: „${d.name}” (${d.sessions} zabiegów)`,
    data: d,
  });
  return NextResponse.json({ ok: true, template });
}

const PatchSchema = TemplateSchema.partial().extend({ id: z.string().min(1).max(100) });

// Zmiana pakietu w katalogu (także wyłączenie/włączenie). Sprzedane już pakiety zostają bez zmian.
export async function PATCH(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, WRITE_ROLES);
  if (deny) return deny;

  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: parsed.error.issues[0]?.message ?? "Niepoprawne dane" }, { status: 400 });
  }
  const { id, ...d } = parsed.data;
  const existing = await prisma.packageTemplate.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!existing) return NextResponse.json({ ok: false, message: "Nie znaleziono pakietu w katalogu" }, { status: 404 });

  await prisma.packageTemplate.update({
    where: { id },
    data: {
      ...(d.name !== undefined ? { name: d.name } : {}),
      ...(d.description !== undefined ? { description: d.description || null } : {}),
      ...(d.serviceId !== undefined ? { serviceId: d.serviceId || null } : {}),
      ...(d.sessions !== undefined ? { sessions: d.sessions } : {}),
      ...(d.price !== undefined ? { price: d.price } : {}),
      ...(d.validityDays !== undefined ? { validityDays: d.validityDays ?? null } : {}),
      ...(d.isActive !== undefined ? { isActive: d.isActive } : {}),
    },
  });
  await logAudit({
    actorId: user!.id,
    action: "UPDATE",
    entity: "PackageTemplate",
    entityId: id,
    summary: `Zmiana pakietu w katalogu: „${existing.name}”`,
    data: d,
  });
  return NextResponse.json({ ok: true });
}
