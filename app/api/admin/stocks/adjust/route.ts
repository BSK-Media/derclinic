import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { requireAuth, requireRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";

const BodySchema = z.object({
  productId: z.string().min(1),
  warehouseId: z.string().min(1),
  delta: z.number(), // can be fractional
  note: z.string().optional(),
});

export async function POST(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, message: "Niepoprawne dane" }, { status: 400 });

  const { productId, warehouseId, delta, note } = parsed.data;

  const stock = await prisma.stock.upsert({
    where: { productId_warehouseId: { productId, warehouseId } },
    update: { quantity: { increment: new Prisma.Decimal(delta) } },
    create: { productId, warehouseId, quantity: new Prisma.Decimal(delta) },
  });

  await prisma.consumption.create({
    data: {
      kind: delta >= 0 ? "INTERNAL" : "INTERNAL",
      productId,
      warehouseId,
      quantity: new Prisma.Decimal(Math.abs(delta)),
      createdById: user!.id,
      note: note ? `Korekta stanu: ${delta}` : `Korekta stanu: ${delta}`,
    },
  });

  await logAudit({ actorId: user!.id, action: "STOCK_ADJUST", entity: "Stock", entityId: stock.id, data: { productId, warehouseId, delta } });

  return NextResponse.json({ ok: true, stock });
}
