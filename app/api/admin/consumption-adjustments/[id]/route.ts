import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";

const BodySchema = z.object({
  action: z.enum(["approve", "reject"]),
  note: z.string().optional().or(z.literal("")),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, message: "Niepoprawne dane" }, { status: 400 });

  const consumption = await prisma.consumption.findUnique({ where: { id: params.id } });
  if (!consumption) return NextResponse.json({ ok: false, message: "Nie znaleziono zgłoszenia" }, { status: 404 });
  if (consumption.status !== "PENDING") {
    return NextResponse.json({ ok: false, message: "Ta zmiana została już rozpatrzona" }, { status: 400 });
  }

  if (parsed.data.action === "reject") {
    const updated = await prisma.consumption.update({
      where: { id: consumption.id },
      data: {
        status: "REJECTED",
        reviewedById: user!.id,
        reviewedAt: new Date(),
        note: parsed.data.note ? parsed.data.note : consumption.note,
      },
    });
    await logAudit({ actorId: user!.id, action: "REJECT", entity: "Consumption", entityId: updated.id });
    return NextResponse.json({ ok: true, consumption: updated });
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (consumption.warehouseId) {
      await tx.stock.upsert({
        where: {
          productId_warehouseId: {
            productId: consumption.productId,
            warehouseId: consumption.warehouseId,
          },
        },
        update: { quantity: { decrement: consumption.quantity } },
        create: {
          productId: consumption.productId,
          warehouseId: consumption.warehouseId,
          quantity: new Prisma.Decimal(0).minus(consumption.quantity),
        },
      });
    }

    return tx.consumption.update({
      where: { id: consumption.id },
      data: {
        status: "APPLIED",
        reviewedById: user!.id,
        reviewedAt: new Date(),
        note: parsed.data.note ? parsed.data.note : consumption.note,
      },
    });
  });

  await logAudit({ actorId: user!.id, action: "APPROVE", entity: "Consumption", entityId: updated.id });

  return NextResponse.json({ ok: true, consumption: updated });
}
