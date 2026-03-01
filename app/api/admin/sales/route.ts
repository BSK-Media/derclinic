import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/api-helpers";

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireRole(user!.role, ["ADMIN", "RECEPTION"]);
  if (deny) return deny;

  const [products, warehouses, patients, sales] = await Promise.all([
    prisma.product.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.warehouse.findMany({ orderBy: [{ parentId: "asc" }, { name: "asc" }] }),
    prisma.patient.findMany({ orderBy: { name: "asc" }, take: 500 }),
    prisma.retailSale.findMany({
      orderBy: { createdAt: "desc" },
      include: { patient: true, items: { include: { product: true } }, payments: true },
      take: 50,
    }),
  ]);

  return NextResponse.json({ ok: true, products, warehouses, patients, sales });
}

export async function POST(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireRole(user!.role, ["ADMIN", "RECEPTION"]);
  if (deny) return deny;

  const body = await req.json().catch(() => null);
  if (!body) return bad("Nieprawidłowe dane");

  const { patientId, warehouseId, items, note, payment } = body as {
    patientId: string | null;
    warehouseId: string;
    items: { productId: string; quantity: string }[];
    note?: string;
    payment?: { method: "CASH" | "CARD" | "VOUCHER"; amount: number };
  };

  if (!warehouseId) return bad("Wybierz magazyn");
  if (!Array.isArray(items) || items.length === 0) return bad("Brak pozycji");
  if (!payment?.method || typeof payment.amount !== "number") return bad("Brak płatności");

  // Load products and validate
  const productIds = [...new Set(items.map((i) => i.productId))];
  const products = await prisma.product.findMany({ where: { id: { in: productIds } } });
  const productMap = new Map(products.map((p) => [p.id, p] as const));
  for (const it of items) {
    const p = productMap.get(it.productId);
    if (!p) return bad("Nieznany produkt");
    const q = parseFloat(it.quantity || "0");
    if (!Number.isFinite(q) || q <= 0) return bad("Nieprawidłowa ilość");
  }

  // Transaction: create sale + items + payment + consumption + stock decrement
  try {
  const sale = await prisma.$transaction(async (tx) => {
    // Ensure stock rows exist
    for (const it of items) {
      await tx.stock.upsert({
        where: { productId_warehouseId: { productId: it.productId, warehouseId } },
        create: { productId: it.productId, warehouseId, quantity: 0 },
        update: {},
      });
    }

    // Validate available stock
    const stocks = await tx.stock.findMany({ where: { warehouseId, productId: { in: productIds } } });
    const stockMap = new Map(stocks.map((s) => [s.productId, parseFloat(String(s.quantity))] as const));
    for (const it of items) {
      const q = parseFloat(it.quantity);
      const available = stockMap.get(it.productId) ?? 0;
      if (available < q) {
        const p = productMap.get(it.productId)!;
        throw new Error(`Brak stanu: ${p.name}. Dostępne: ${available}`);
      }
    }

    const created = await tx.retailSale.create({
      data: {
        patientId: patientId || null,
        soldById: user!.id,
        note: note || null,
        items: {
          create: items.map((it) => {
            const p = productMap.get(it.productId)!;
            const q = parseFloat(it.quantity);
            const unit = p.salePrice ?? 0;
            const total = Math.round(unit * q);
            return {
              productId: it.productId,
              quantity: q,
              unitPrice: unit,
              total,
            };
          }),
        },
        payments: {
          create: [{ method: payment.method, amount: payment.amount }],
        },
      },
      include: { items: true },
    });

    // Create consumptions + decrement stock
    for (const it of items) {
      const q = parseFloat(it.quantity);
      await tx.consumption.create({
        data: {
          kind: "SALE",
          productId: it.productId,
          warehouseId,
          quantity: q,
          createdById: user!.id,
          note: `Sprzedaż ${created.id}`,
        },
      });

      await tx.stock.update({
        where: { productId_warehouseId: { productId: it.productId, warehouseId } },
        data: { quantity: { decrement: q } },
      });
    }

    await tx.auditLog.create({
      data: {
        actorId: user!.id,
        action: "sale.create",
        entity: "RetailSale",
        entityId: created.id,
        data: { itemsCount: items.length, warehouseId },
      },
    });

    return created;
  });

  return NextResponse.json({ ok: true, saleId: sale.id });
  } catch (e: any) {
    return bad(typeof e?.message === "string" ? e.message : "Błąd");
  }
}
