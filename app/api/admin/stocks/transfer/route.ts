import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/api-helpers";

const TransferSchema = z.object({
  productId: z.string().min(1),
  fromWarehouseId: z.string().min(1),
  toWarehouseId: z.string().min(1),
  quantity: z.union([z.string(), z.number()]),
  note: z.string().optional(),
});

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

export async function POST(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const body = await req.json().catch(() => null);
  const parsed = TransferSchema.safeParse(body);
  if (!parsed.success) return bad("Nieprawidłowe dane");

  const { productId, fromWarehouseId, toWarehouseId, note } = parsed.data;
  if (fromWarehouseId === toWarehouseId) return bad("Magazyny muszą być różne");

  const quantity = Number(parsed.data.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) return bad("Nieprawidłowa ilość");

  try {
    await prisma.$transaction(async (tx) => {
      const [fromWarehouse, toWarehouse, fromStock] = await Promise.all([
        tx.warehouse.findUnique({ where: { id: fromWarehouseId } }),
        tx.warehouse.findUnique({ where: { id: toWarehouseId } }),
        tx.stock.findUnique({ where: { productId_warehouseId: { productId, warehouseId: fromWarehouseId } } }),
      ]);

      if (!fromWarehouse || !toWarehouse) throw new Error("Nie znaleziono wybranego magazynu");

      const available = Number(fromStock?.quantity ?? 0);
      if (available < quantity) throw new Error(`Brak stanu. Dostępne: ${available}`);

      if (available === quantity && fromStock) {
        await tx.stock.delete({ where: { id: fromStock.id } });
      } else {
        await tx.stock.update({
          where: { productId_warehouseId: { productId, warehouseId: fromWarehouseId } },
          data: { quantity: { decrement: new Prisma.Decimal(quantity) } },
        });
      }

      await tx.stock.upsert({
        where: { productId_warehouseId: { productId, warehouseId: toWarehouseId } },
        create: { productId, warehouseId: toWarehouseId, quantity: new Prisma.Decimal(quantity) },
        update: { quantity: { increment: new Prisma.Decimal(quantity) } },
      });

      let remaining = quantity;
      const sourceLots = await tx.productLot.findMany({
        where: { productId, warehouseId: fromWarehouseId, quantity: { gt: 0 } },
        orderBy: [{ expiryDate: "asc" }, { createdAt: "asc" }],
      });

      for (const lot of sourceLots) {
        if (remaining <= 0) break;
        const lotQuantity = Number(lot.quantity);
        const moved = Math.min(lotQuantity, remaining);

        if (moved === lotQuantity) {
          await tx.productLot.delete({ where: { id: lot.id } });
        } else {
          await tx.productLot.update({
            where: { id: lot.id },
            data: { quantity: { decrement: new Prisma.Decimal(moved) } },
          });
        }

        const destinationLot = await tx.productLot.findFirst({
          where: { productId, warehouseId: toWarehouseId, batchNumber: lot.batchNumber },
        });

        if (destinationLot) {
          await tx.productLot.update({
            where: { id: destinationLot.id },
            data: { quantity: { increment: new Prisma.Decimal(moved) } },
          });
        } else {
          await tx.productLot.create({
            data: {
              productId,
              warehouseId: toWarehouseId,
              batchNumber: lot.batchNumber,
              expiryDate: lot.expiryDate,
              quantity: new Prisma.Decimal(moved),
              purchasePrice: lot.purchasePrice,
              salePrice: lot.salePrice,
              status: lot.status,
              location: lot.location,
              note: lot.note,
            },
          });
        }
        remaining -= moved;
      }

      if (available === quantity) {
        await tx.productLot.deleteMany({ where: { productId, warehouseId: fromWarehouseId } });
      }

      await tx.consumption.createMany({
        data: [
          {
            kind: "INTERNAL",
            productId,
            warehouseId: fromWarehouseId,
            quantity: new Prisma.Decimal(quantity),
            createdById: user!.id,
            note: `Transfer OUT → ${toWarehouse.name}${note?.trim() ? ` • ${note.trim()}` : ""}`,
          },
          {
            kind: "INTERNAL",
            productId,
            warehouseId: toWarehouseId,
            quantity: new Prisma.Decimal(quantity),
            createdById: user!.id,
            note: `Transfer IN ← ${fromWarehouse.name}${note?.trim() ? ` • ${note.trim()}` : ""}`,
          },
        ],
      });

      await tx.auditLog.create({
        data: {
          actorId: user!.id,
          action: "stock.transfer",
          entity: "Stock",
          entityId: productId,
          data: { productId, fromWarehouseId, toWarehouseId, quantity, note: note?.trim() || null },
        },
      });
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return bad(error instanceof Error ? error.message : "Nie udało się wykonać transferu");
  }
}
