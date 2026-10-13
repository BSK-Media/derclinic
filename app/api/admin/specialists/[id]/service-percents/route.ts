import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";

// Zabiegi przypisane do specjalisty z jego procentem: ogólnym (User.payoutPercent) albo wyjątkiem
// dla konkretnego zabiegu (SpecialistServicePercent), który nadpisuje procent ogólny.

async function ensureSpecialist(id: string) {
  return prisma.user.findFirst({
    where: { id, role: "SPECIALIST" },
    select: { id: true, name: true, payoutPercent: true },
  });
}

export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = await requireRole(user!.role, ["ADMIN", "MANAGER"]);
  if (deny) return deny;

  const specialist = await ensureSpecialist(params.id);
  if (!specialist) return NextResponse.json({ ok: false, message: "Nie znaleziono specjalisty" }, { status: 404 });

  const [services, overrides] = await Promise.all([
    prisma.service.findMany({
      where: { specialistAssignments: { some: { specialistId: params.id } } },
      orderBy: [{ category: "asc" }, { name: "asc" }],
      select: { id: true, name: true, category: true },
    }),
    prisma.specialistServicePercent.findMany({
      where: { specialistId: params.id },
      select: { serviceId: true, percent: true },
    }),
  ]);
  const overrideByService = new Map(overrides.map((row) => [row.serviceId, row.percent]));

  return NextResponse.json({
    ok: true,
    generalPercent: specialist.payoutPercent,
    services: services.map((service) => ({
      id: service.id,
      name: service.name,
      category: service.category,
      overridePercent: overrideByService.get(service.id) ?? null,
      effectivePercent: overrideByService.get(service.id) ?? specialist.payoutPercent,
    })),
  });
}

const PutSchema = z.object({
  serviceId: z.string().min(1),
  // null = usuń wyjątek (wraca procent ogólny)
  percent: z.number().int().min(0).max(100).nullable(),
});

export async function PUT(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = await requireRole(user!.role, ["ADMIN", "MANAGER"]);
  if (deny) return deny;

  const parsed = PutSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: "Podaj procent jako liczbę całkowitą od 0 do 100" }, { status: 400 });
  }
  const { serviceId, percent } = parsed.data;

  const specialist = await ensureSpecialist(params.id);
  if (!specialist) return NextResponse.json({ ok: false, message: "Nie znaleziono specjalisty" }, { status: 404 });

  // Wyjątek tylko dla zabiegu faktycznie przypisanego do specjalisty.
  const service = await prisma.service.findFirst({
    where: { id: serviceId, specialistAssignments: { some: { specialistId: params.id } } },
    select: { id: true, name: true },
  });
  if (!service) {
    return NextResponse.json({ ok: false, message: "Ten zabieg nie jest przypisany do specjalisty" }, { status: 404 });
  }

  const previous = await prisma.specialistServicePercent.findUnique({
    where: { specialistId_serviceId: { specialistId: params.id, serviceId } },
    select: { percent: true },
  });

  if (percent === null) {
    await prisma.specialistServicePercent.deleteMany({ where: { specialistId: params.id, serviceId } });
  } else {
    await prisma.specialistServicePercent.upsert({
      where: { specialistId_serviceId: { specialistId: params.id, serviceId } },
      update: { percent },
      create: { specialistId: params.id, serviceId, percent },
    });
  }

  const label = (value: number | null | undefined) => (value == null ? `ogólny (${specialist.payoutPercent}%)` : `${value}%`);
  await logAudit({
    actorId: user!.id,
    action: "UPDATE",
    entity: "SpecialistServicePercent",
    entityId: `${params.id}:${serviceId}`,
    summary: `Procent specjalisty ${specialist.name} za zabieg „${service.name}”: ${label(previous?.percent)} → ${label(percent)}`,
    data: { serviceId, percent, changes: { percent: { from: previous?.percent ?? null, to: percent } } },
  });

  return NextResponse.json({
    ok: true,
    serviceId,
    overridePercent: percent,
    effectivePercent: percent ?? specialist.payoutPercent,
  });
}
