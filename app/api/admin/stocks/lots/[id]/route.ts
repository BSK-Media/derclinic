import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole, scopedLocationWhere } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";

// Poprawianie pomyłek przy przyjęciu: edycja partii (numer, numer seryjny, termin, ilość)
// albo jej usunięcie. Zmiana ilości partii zmienia też stan produktu w tym magazynie.

const PatchSchema = z.object({
  batchNumber: z.string().trim().min(1).max(100),
  serialNumber: z.string().trim().max(500).nullable().optional(),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  quantity: z.number().finite().min(0),
});

type Tx = Prisma.TransactionClient;
type LotWithNames = Prisma.ProductLotGetPayload<{
  include: { product: { select: { name: true } }; warehouse: { select: { name: true } } };
}>;

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

function dateKey(date: Date | null) {
  return date ? date.toISOString().slice(0, 10) : null;
}

async function authorize() {
  const { user, error } = await requireAuth();
  if (error) return { user: null, error };
  const deny = await requireRole(user!.role, ["ADMIN", "MANAGER"]);
  if (deny) return { user: null, error: deny };
  return { user: user!, error: null };
}

async function findLot(tx: Tx, id: string, user: { locationScopeId: string | null }) {
  return tx.productLot.findFirst({
    where: { id, warehouse: scopedLocationWhere(user) },
    include: { product: { select: { name: true } }, warehouse: { select: { name: true } } },
  });
}

// Zmienia stan produktu w magazynie o delta (nie schodząc poniżej zera) i zapisuje ruch.
async function changeStock(tx: Tx, lot: LotWithNames, delta: number, userId: string, note: string) {
  if (delta === 0) return;
  const stock = await tx.stock.findUnique({
    where: { productId_warehouseId: { productId: lot.productId, warehouseId: lot.warehouseId } },
  });
  const next = Math.max(0, Number(stock?.quantity ?? 0) + delta);
  if (stock && next === 0) {
    await tx.stock.delete({ where: { id: stock.id } });
  } else if (stock) {
    await tx.stock.update({ where: { id: stock.id }, data: { quantity: new Prisma.Decimal(next) } });
  } else if (next > 0) {
    await tx.stock.create({
      data: { productId: lot.productId, warehouseId: lot.warehouseId, quantity: new Prisma.Decimal(next) },
    });
  }
  await tx.consumption.create({
    data: {
      kind: "INTERNAL",
      productId: lot.productId,
      warehouseId: lot.warehouseId,
      quantity: new Prisma.Decimal(Math.abs(delta)),
      createdById: userId,
      note,
    },
  });
}

export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const { user, error } = await authorize();
  if (error) return error;

  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("Niepoprawne dane partii");
  const { batchNumber, quantity } = parsed.data;
  const serialNumber = parsed.data.serialNumber?.trim() || null;
  const expiryDate = parsed.data.expiryDate ? new Date(`${parsed.data.expiryDate}T12:00:00.000Z`) : null;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const lot = await findLot(tx, id, user!);
      if (!lot) throw new Error("Nie znaleziono partii");

      if (serialNumber) {
        const others = await tx.productLot.findMany({
          where: { productId: lot.productId, id: { not: lot.id }, quantity: { gt: 0 }, serialNumber: { contains: serialNumber } },
          select: { serialNumber: true },
        });
        const own = new Set((lot.serialNumber ?? "").split(", "));
        const conflict = serialNumber
          .split(", ")
          .find((serial) => !own.has(serial) && others.some((other) => (other.serialNumber ?? "").split(", ").includes(serial)));
        if (conflict) throw new Error(`Egzemplarz o numerze seryjnym ${conflict} jest już na stanie w innej partii.`);
      }

      const delta = quantity - Number(lot.quantity);
      await changeStock(
        tx,
        lot,
        delta,
        user!.id,
        `Korekta partii ${lot.batchNumber}: ${delta > 0 ? "+" : "-"}${Math.abs(delta)}`,
      );

      const updated = await tx.productLot.update({
        where: { id: lot.id },
        data: { batchNumber, serialNumber, expiryDate, quantity: new Prisma.Decimal(quantity) },
      });

      const changes: Record<string, { from: unknown; to: unknown }> = {};
      if (lot.batchNumber !== batchNumber) changes.batchNumber = { from: lot.batchNumber, to: batchNumber };
      if ((lot.serialNumber ?? null) !== serialNumber) changes.serialNumber = { from: lot.serialNumber, to: serialNumber };
      if (dateKey(lot.expiryDate) !== dateKey(expiryDate)) {
        changes.expiryDate = { from: dateKey(lot.expiryDate), to: dateKey(expiryDate) };
      }
      if (delta !== 0) changes.quantity = { from: Number(lot.quantity), to: quantity };

      await logAudit({
        tx,
        actorId: user!.id,
        action: "UPDATE",
        entity: "ProductLot",
        entityId: lot.id,
        summary: `Korekta partii ${lot.batchNumber} „${lot.product.name}" (${lot.warehouse.name})`,
        data: { productId: lot.productId, warehouseId: lot.warehouseId, changes },
      });

      return updated;
    });
    return NextResponse.json({ ok: true, lot: result });
  } catch (e) {
    return bad(e instanceof Error ? e.message : "Nie udało się zapisać partii");
  }
}

export async function DELETE(_req: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const { user, error } = await authorize();
  if (error) return error;

  try {
    await prisma.$transaction(async (tx) => {
      const lot = await findLot(tx, id, user!);
      if (!lot) throw new Error("Nie znaleziono partii");
      const quantity = Number(lot.quantity);
      await changeStock(tx, lot, -quantity, user!.id, `Usunięcie partii ${lot.batchNumber}: -${quantity}`);
      await tx.productLot.delete({ where: { id: lot.id } });
      await logAudit({
        tx,
        actorId: user!.id,
        action: "DELETE",
        entity: "ProductLot",
        entityId: lot.id,
        summary: `Usunięcie partii ${lot.batchNumber} „${lot.product.name}" (${lot.warehouse.name}), ilość ${quantity}`,
        data: {
          productId: lot.productId,
          warehouseId: lot.warehouseId,
          batchNumber: lot.batchNumber,
          serialNumber: lot.serialNumber,
          expiryDate: dateKey(lot.expiryDate),
          quantity,
        },
      });
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return bad(e instanceof Error ? e.message : "Nie udało się usunąć partii");
  }
}
