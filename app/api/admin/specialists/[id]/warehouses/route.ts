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
    select: { id: true, name: true, warehouseAssignments: { select: { warehouseId: true } } },
  });
  if (!specialist) return NextResponse.json({ ok: false, message: "Nie znaleziono pracownika" }, { status: 404 });

  const warehouses = await prisma.warehouse.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
  const assignedIds = specialist.warehouseAssignments.map((a) => a.warehouseId);

  return NextResponse.json({ ok: true, warehouses, assignedIds });
}

const PutSchema = z.object({
  warehouseId: z.string().min(1),
  assigned: z.boolean(),
});

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const json = await req.json().catch(() => null);
  const parsed = PutSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, message: "Niepoprawne dane" }, { status: 400 });

  const [specialist, warehouse] = await Promise.all([
    prisma.user.findUnique({ where: { id: params.id }, select: { id: true } }),
    prisma.warehouse.findUnique({ where: { id: parsed.data.warehouseId }, select: { id: true } }),
  ]);
  if (!specialist) return NextResponse.json({ ok: false, message: "Nie znaleziono pracownika" }, { status: 404 });
  if (!warehouse) return NextResponse.json({ ok: false, message: "Nie znaleziono magazynu" }, { status: 404 });

  if (parsed.data.assigned) {
    await prisma.specialistWarehouse.upsert({
      where: { specialistId_warehouseId: { specialistId: specialist.id, warehouseId: warehouse.id } },
      update: {},
      create: { specialistId: specialist.id, warehouseId: warehouse.id },
    });
  } else {
    await prisma.specialistWarehouse.deleteMany({
      where: { specialistId: specialist.id, warehouseId: warehouse.id },
    });
  }

  await logAudit({
    actorId: user!.id,
    action: "UPDATE",
    entity: "SpecialistWarehouse",
    entityId: `${specialist.id}:${warehouse.id}`,
    data: { assigned: parsed.data.assigned },
  });

  return NextResponse.json({ ok: true });
}
