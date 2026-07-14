import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const specialist = await prisma.user.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, baseRate: true },
  });
  if (!specialist) return NextResponse.json({ ok: false, message: "Nie znaleziono pracownika" }, { status: 404 });

  const [services, rates] = await Promise.all([
    prisma.service.findMany({
      where: { specialistAssignments: { some: { specialistId: params.id } } },
      orderBy: [{ category: "asc" }, { name: "asc" }],
      select: { id: true, name: true, category: true },
    }),
    prisma.specialistServiceRate.findMany({ where: { specialistId: params.id } }),
  ]);

  const rateByService = new Map(rates.map((r) => [r.serviceId, r.amount]));

  return NextResponse.json({
    ok: true,
    specialist,
    services: services.map((s) => ({
      id: s.id,
      name: s.name,
      category: s.category,
      amount: rateByService.get(s.id) ?? null, // grosze; null = używana stawka domyślna
    })),
  });
}

const PutSchema = z.union([
  // Ustawienie/wyczyszczenie stawki dla konkretnego zabiegu
  z.object({ serviceId: z.string().min(1), amount: z.number().int().min(0).nullable() }),
  // Ustawienie/wyczyszczenie stawki domyślnej pracownika
  z.object({ baseRate: z.number().int().min(0).nullable() }),
]);

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const json = await req.json().catch(() => null);
  const parsed = PutSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, message: "Niepoprawne dane" }, { status: 400 });

  const specialist = await prisma.user.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!specialist) return NextResponse.json({ ok: false, message: "Nie znaleziono pracownika" }, { status: 404 });

  if ("baseRate" in parsed.data) {
    await prisma.user.update({ where: { id: params.id }, data: { baseRate: parsed.data.baseRate } });
    await logAudit({
      actorId: user!.id,
      action: "UPDATE",
      entity: "SpecialistBaseRate",
      entityId: params.id,
      data: { baseRate: parsed.data.baseRate },
    });
    return NextResponse.json({ ok: true, baseRate: parsed.data.baseRate });
  }

  const { serviceId, amount } = parsed.data;
  const service = await prisma.service.findUnique({ where: { id: serviceId }, select: { id: true } });
  if (!service) return NextResponse.json({ ok: false, message: "Nie znaleziono zabiegu" }, { status: 404 });

  if (amount === null) {
    await prisma.specialistServiceRate.deleteMany({ where: { specialistId: params.id, serviceId } });
  } else {
    await prisma.specialistServiceRate.upsert({
      where: { specialistId_serviceId: { specialistId: params.id, serviceId } },
      update: { amount },
      create: { specialistId: params.id, serviceId, amount },
    });
  }

  await logAudit({
    actorId: user!.id,
    action: "UPDATE",
    entity: "SpecialistServiceRate",
    entityId: `${params.id}:${serviceId}`,
    data: { amount },
  });

  return NextResponse.json({ ok: true, serviceId, amount });
}
