import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";

const BodySchema = z.object({
  productId: z.string().min(1),
  warehouseId: z.string().min(1),
  delta: z.number().finite().refine((value) => value !== 0),
  expiryDate: z.string().optional(),
  batchNumber: z.string().optional(),
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

  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return bad("Niepoprawne dane");

  const { productId, warehouseId, delta, expiryDate, batchNumber, note } = parsed.data;
  const parsedExpiry = expiryDate ? new Date(`${expiryDate}T12:00:00.000Z`) : null;

  if (delta > 0 && (!parsedExpiry || Number.isNaN(parsedExpiry.getTime()))) {
    return bad("Podaj prawidłowy termin ważności dodawanej partii");
  }

  try {
    const stock = await prisma.$transaction(async (tx) => {
      const [product, warehouse, existingStock] = await Promise.all([
        tx.product.findUnique({ where: { id: productId } }),
        tx.warehouse.findUnique({ where: { id: warehouseId } }),
        tx.stock.findUnique({ where: { productId_warehouseId: { productId, warehouseId } } }),
      ]);

      if (!product) throw new Error("Nie znaleziono produktu");
      if (!warehouse) throw new Error("Nie znaleziono magazynu");

      const currentQuantity = Number(existingStock?.quantity ?? 0);
      const nextQuantity = currentQuantity + delta;
      if (nextQuantity < 0) {
        throw new Error(`Brak wystarczającej ilości. Dostępne: ${currentQuantity}`);
      }

      let updatedStock = null;
      if (nextQuantity === 0) {
        if (existingStock) await tx.stock.delete({ where: { id: existingStock.id } });
      } else if (existingStock) {
        updatedStock = await tx.stock.update({
          where: { id: existingStock.id },
          data: { quantity: new Prisma.Decimal(nextQuantity) },
        });
      } else {
        updatedStock = await tx.stock.create({
          data: { productId, warehouseId, quantity: new Prisma.Decimal(nextQuantity) },
        });
      }

      if (delta > 0 && parsedExpiry) {
        const normalizedBatch = batchNumber?.trim() || `DOSTAWA-${Date.now()}`;
        const existingLot = await tx.productLot.findFirst({
          where: { productId, warehouseId, batchNumber: normalizedBatch },
        });

        if (existingLot) {
          await tx.productLot.update({
            where: { id: existingLot.id },
            data: {
              quantity: { increment: new Prisma.Decimal(delta) },
              expiryDate: parsedExpiry,
              purchasePrice: product.purchasePrice,
              salePrice: product.salePrice,
            },
          });
        } else {
          await tx.productLot.create({
            data: {
              productId,
              warehouseId,
              batchNumber: normalizedBatch,
              expiryDate: parsedExpiry,
              quantity: new Prisma.Decimal(delta),
              purchasePrice: product.purchasePrice,
              salePrice: product.salePrice,
              status: "Dostępny",
              note: note?.trim() || null,
            },
          });
        }
      }

      if (delta < 0) {
        let remaining = Math.abs(delta);
        const productLots = await tx.productLot.findMany({
          where: { productId, warehouseId, quantity: { gt: 0 } },
          orderBy: [{ expiryDate: "asc" }, { createdAt: "asc" }],
        });

        for (const lot of productLots) {
          if (remaining <= 0) break;
          const lotQuantity = Number(lot.quantity);
          const deducted = Math.min(lotQuantity, remaining);

          if (deducted === lotQuantity) {
            await tx.productLot.delete({ where: { id: lot.id } });
          } else {
            await tx.productLot.update({
              where: { id: lot.id },
              data: { quantity: { decrement: new Prisma.Decimal(deducted) } },
            });
          }
          remaining -= deducted;
        }

        if (nextQuantity === 0) {
          await tx.productLot.deleteMany({ where: { productId, warehouseId } });
        }
      }

      await tx.consumption.create({
        data: {
          kind: "INTERNAL",
          productId,
          warehouseId,
          quantity: new Prisma.Decimal(Math.abs(delta)),
          createdById: user!.id,
          note: `${delta > 0 ? "Dodanie" : "Usunięcie"} stanu: ${Math.abs(delta)}${note?.trim() ? ` • ${note.trim()}` : ""}`,
        },
      });

      return updatedStock;
    });

    await logAudit({
      actorId: user!.id,
      action: "STOCK_ADJUST",
      entity: "Stock",
      entityId: stock?.id ?? `${warehouseId}:${productId}`,
      data: { productId, warehouseId, delta, expiryDate: expiryDate ?? null, batchNumber: batchNumber ?? null },
    });

    return NextResponse.json({ ok: true, stock });
  } catch (error) {
    return bad(error instanceof Error ? error.message : "Nie udało się zmienić stanu magazynowego");
  }
}
