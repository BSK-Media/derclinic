import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/api-helpers";

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

export async function POST(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const body = await req.json().catch(() => null);
  if (!body) return bad("Nieprawidłowe dane");
  const { productId, fromWarehouseId, toWarehouseId, quantity, note } = body as {
    productId: string;
    fromWarehouseId: string;
    toWarehouseId: string;
    quantity: string;
    note?: string;
  };

  if (!productId || !fromWarehouseId || !toWarehouseId) return bad("Uzupełnij pola");
  if (fromWarehouseId === toWarehouseId) return bad("Magazyny muszą być różne");
  const q = parseFloat(quantity || "0");
  if (!Number.isFinite(q) || q <= 0) return bad("Nieprawidłowa ilość");

  try {
    await prisma.$transaction(async (tx) => {
      // Ensure stock rows
      await tx.stock.upsert({
        where: { productId_warehouseId: { productId, warehouseId: fromWarehouseId } },
        create: { productId, warehouseId: fromWarehouseId, quantity: 0 },
        update: {},
      });
      await tx.stock.upsert({
        where: { productId_warehouseId: { productId, warehouseId: toWarehouseId } },
        create: { productId, warehouseId: toWarehouseId, quantity: 0 },
        update: {},
      });

      const from = await tx.stock.findUnique({ where: { productId_warehouseId: { productId, warehouseId: fromWarehouseId } } });
      const available = parseFloat(String(from?.quantity ?? 0));
      if (available < q) throw new Error(`Brak stanu. Dostępne: ${available}`);

      // Decrement / increment
      await tx.stock.update({
        where: { productId_warehouseId: { productId, warehouseId: fromWarehouseId } },
        data: { quantity: { decrement: q } },
      });
      await tx.stock.update({
        where: { productId_warehouseId: { productId, warehouseId: toWarehouseId } },
        data: { quantity: { increment: q } },
      });

      // Audit consumptions (internal)
      await tx.consumption.create({
        data: {
          kind: "INTERNAL",
          productId,
          warehouseId: fromWarehouseId,
          quantity: q,
          createdById: user!.id,
          note: `Transfer OUT → ${toWarehouseId}${note ? ` • ${note}` : ""}`,
        },
      });
      await tx.consumption.create({
        data: {
          kind: "INTERNAL",
          productId,
          warehouseId: toWarehouseId,
          quantity: -q,
          createdById: user!.id,
          note: `Transfer IN ← ${fromWarehouseId}${note ? ` • ${note}` : ""}`,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: user!.id,
          action: "stock.transfer",
          entity: "Stock",
          entityId: productId,
          data: { productId, fromWarehouseId, toWarehouseId, quantity: q, note: note || null },
        },
      });
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return bad(typeof e?.message === "string" ? e.message : "Błąd");
  }
}
