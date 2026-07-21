import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole, scopedLocationWhere } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";

export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const warehouses = await prisma.warehouse.findMany({
    where: scopedLocationWhere(user!),
    orderBy: [{ parentId: "asc" }, { name: "asc" }],
  });

  return NextResponse.json({ ok: true, warehouses });
}

const CreateSchema = z.object({
  name: z.string().trim().min(2),
  locationId: z.string().min(1),
  parentId: z.string().optional().nullable(),
});

export async function POST(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const json = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, message: "Niepoprawne dane" }, { status: 400 });

  const location = await prisma.location.findFirst({
    where: { id: parsed.data.locationId, isActive: true },
    select: { id: true },
  });
  if (!location) {
    return NextResponse.json({ ok: false, message: "Wybrana lokalizacja nie istnieje lub jest nieaktywna" }, { status: 400 });
  }

  if (parsed.data.parentId) {
    const parentWarehouse = await prisma.warehouse.findFirst({
      where: { id: parsed.data.parentId, locationId: location.id },
      select: { id: true },
    });
    if (!parentWarehouse) {
      return NextResponse.json({ ok: false, message: "Magazyn nadrzędny musi należeć do tej samej lokalizacji" }, { status: 400 });
    }
  }

  const duplicate = await prisma.warehouse.findFirst({
    where: {
      locationId: location.id,
      name: { equals: parsed.data.name, mode: "insensitive" },
    },
  });
  if (duplicate) {
    return NextResponse.json({ ok: false, message: "Magazyn o tej nazwie już istnieje w wybranej lokalizacji" }, { status: 409 });
  }

  const wh = await prisma.warehouse.create({
    data: { name: parsed.data.name, parentId: parsed.data.parentId ?? null, locationId: location.id },
  });

  await logAudit({ actorId: user!.id, action: "CREATE", entity: "Warehouse", entityId: wh.id });

  return NextResponse.json({ ok: true, warehouse: wh });
}
