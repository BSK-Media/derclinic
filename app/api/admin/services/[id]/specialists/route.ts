import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole, requireStrictRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireRole(user!.role, ["ADMIN", "RECEPTION"]);
  if (deny) return deny;

  const [service, specialists, products] = await Promise.all([
    prisma.service.findUnique({
      where: { id: params.id },
      include: {
        suggestedProducts: {
          orderBy: { product: { name: "asc" } },
          include: { product: true },
        },
        specialistAssignments: {
          where: user!.locationScopeId
            ? { specialist: { locationId: user!.locationScopeId } }
            : {},
          include: { specialist: { select: { id: true, name: true } } },
        },
      },
    }),
    prisma.user.findMany({
      where: { role: "SPECIALIST", ...(user!.locationScopeId ? { locationId: user!.locationScopeId } : {}) },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.product.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, unit: true },
    }),
  ]);

  if (!service) {
    return NextResponse.json({ ok: false, message: "Nie znaleziono usługi" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    viewerRole: user!.role,
    service,
    specialists,
    products,
  });
}

const PatchSchema = z
  .object({
    name: z.string().trim().min(2, "Podaj nazwę usługi").max(200).optional(),
    category: z.string().trim().max(120).nullable().optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    durationMin: z.number().int().min(5).max(480).optional(),
    price: z.number().int().min(0).nullable().optional(),
  })
  .strict();

const AssignmentSchema = z
  .object({
    specialistId: z.string().min(1),
    assigned: z.boolean(),
  })
  .strict();

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const json = await req.json().catch(() => null);
  const parsed = AssignmentSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: "Niepoprawne dane przypisania" }, { status: 400 });
  }

  const { specialistId, assigned } = parsed.data;
  const [service, specialist] = await Promise.all([
    prisma.service.findUnique({
      where: { id: params.id },
      select: { id: true },
    }),
    prisma.user.findFirst({
      where: {
        id: specialistId,
        role: "SPECIALIST",
        ...(user!.locationScopeId ? { locationId: user!.locationScopeId } : {}),
      },
      select: { id: true },
    }),
  ]);

  if (!service) {
    return NextResponse.json({ ok: false, message: "Nie znaleziono usługi" }, { status: 404 });
  }
  if (!specialist) {
    return NextResponse.json(
      { ok: false, message: "Nie znaleziono specjalisty w wybranej lokalizacji" },
      { status: 404 },
    );
  }

  if (assigned) {
    await prisma.specialistService.upsert({
      where: {
        specialistId_serviceId: {
          specialistId,
          serviceId: params.id,
        },
      },
      update: {},
      create: {
        specialistId,
        serviceId: params.id,
      },
    });
  } else {
    await prisma.specialistService.deleteMany({
      where: {
        specialistId,
        serviceId: params.id,
      },
    });
  }

  await logAudit({
    actorId: user!.id,
    action: assigned ? "CREATE" : "DELETE",
    entity: "SpecialistService",
    entityId: `${specialistId}:${params.id}`,
    data: { specialistId, serviceId: params.id, assigned },
  });

  return NextResponse.json({ ok: true, assigned });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const json = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: parsed.error.issues[0]?.message ?? "Niepoprawne dane" },
      { status: 400 },
    );
  }

  const existing = await prisma.service.findUnique({
    where: { id: params.id },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ ok: false, message: "Nie znaleziono usługi" }, { status: 404 });
  }

  const service = await prisma.service.update({
    where: { id: params.id },
    data: parsed.data,
  });

  await logAudit({
    actorId: user!.id,
    action: "UPDATE",
    entity: "Service",
    entityId: service.id,
    data: parsed.data,
  });

  return NextResponse.json({ ok: true, service });
}
