import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole, scopedLocationWhere } from "@/lib/api-helpers";

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireRole(user!.role, ["ADMIN", "RECEPTION"]);
  if (deny) return deny;

  const warehouseRelationWhere = user!.locationScopeId
    ? { warehouse: { locationId: user!.locationScopeId } }
    : {};

  const [products, warehouses, patients, sales] = await Promise.all([
    prisma.product.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      include: {
        stocks: {
          where: warehouseRelationWhere,
          select: { warehouseId: true, quantity: true },
        },
      },
    }),
    prisma.warehouse.findMany({ where: scopedLocationWhere(user!), orderBy: [{ parentId: "asc" }, { name: "asc" }] }),
    prisma.patient.findMany({ where: scopedLocationWhere(user!), orderBy: { name: "asc" }, take: 500 }),
    prisma.retailSale.findMany({
      where: scopedLocationWhere(user!),
      orderBy: { createdAt: "desc" },
      include: {
        patient: true,
        soldBy: { select: { id: true, name: true } },
        discountApprovedBy: { select: { id: true, name: true } },
        items: { include: { product: true } },
        payments: true,
      },
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

  const { patientId, warehouseId, items, note, payments, discount } = body as {
    patientId: string | null;
    warehouseId: string;
    items: { productId: string; quantity: string }[];
    note?: string;
    payments?: { method: "CASH" | "CARD" | "VOUCHER"; amount: number }[];
    discount?: {
      type: "AMOUNT" | "PERCENT";
      value: number;
      approvedById: string;
    } | null;
  };

  if (!warehouseId) return bad("Wybierz magazyn");
  if (!Array.isArray(items) || items.length === 0) return bad("Brak pozycji");
  if (!Array.isArray(payments) || payments.length === 0) return bad("Brak płatności");
  for (const p of payments) {
    if (!["CASH", "CARD", "VOUCHER"].includes(p.method) || typeof p.amount !== "number" || p.amount <= 0) {
      return bad("Nieprawidłowa płatność");
    }
  }

  const warehouse = await prisma.warehouse.findFirst({
    where: { id: warehouseId, ...scopedLocationWhere(user!) },
    select: { id: true, locationId: true },
  });
  if (!warehouse) return bad("Magazyn nie należy do wybranej lokalizacji", 403);
  if (patientId) {
    const patient = await prisma.patient.findFirst({
      where: { id: patientId, locationId: warehouse.locationId },
      select: { id: true },
    });
    if (!patient) return bad("Pacjent jest przypisany do innej lokalizacji");
  }

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

  const subtotal = items.reduce((sum, it) => {
    const p = productMap.get(it.productId)!;
    const q = parseFloat(it.quantity);
    return sum + Math.round((p.salePrice ?? 0) * q);
  }, 0);

  // Weryfikacja zniżki: musi być zatwierdzona przez istniejącego administratora
  let discountType: "AMOUNT" | "PERCENT" | null = null;
  let discountValue: number | null = null;
  let discountAmount = 0;
  let discountApprovedById: string | null = null;

  if (discount) {
    if (!discount.approvedById) return bad("Zniżka wymaga zatwierdzenia przez administratora");
    const approver = await prisma.user.findUnique({
      where: { id: discount.approvedById },
      select: { id: true, role: true },
    });
    if (!approver || approver.role !== "ADMIN") {
      return bad("Zniżka nie została poprawnie zatwierdzona przez administratora", 403);
    }
    if (discount.type === "PERCENT") {
      const pct = Math.min(100, Math.max(0, Math.round(discount.value)));
      discountAmount = Math.round((subtotal * pct) / 100);
      discountType = "PERCENT";
      discountValue = pct;
    } else if (discount.type === "AMOUNT") {
      const amt = Math.max(0, Math.round(discount.value));
      discountAmount = Math.min(subtotal, amt);
      discountType = "AMOUNT";
      discountValue = discountAmount;
    } else {
      return bad("Nieprawidłowy typ zniżki");
    }
    discountApprovedById = approver.id;
  }

  const total = Math.max(0, subtotal - discountAmount);
  const paidSum = payments.reduce((sum, p) => sum + Math.round(p.amount), 0);
  if (paidSum !== total) {
    return bad(
      `Suma płatności (${(paidSum / 100).toFixed(2)} zł) musi być równa kwocie do zapłaty (${(total / 100).toFixed(2)} zł)`,
    );
  }

  // Transaction: create sale + items + payments + consumption + stock decrement
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
        locationId: warehouse.locationId,
        note: note || null,
        subtotal,
        discountType,
        discountValue,
        discountAmount,
        total,
        discountApprovedById,
        items: {
          create: items.map((it) => {
            const p = productMap.get(it.productId)!;
            const q = parseFloat(it.quantity);
            const unit = p.salePrice ?? 0;
            const itemTotal = Math.round(unit * q);
            return {
              productId: it.productId,
              quantity: q,
              unitPrice: unit,
              total: itemTotal,
            };
          }),
        },
        payments: {
          create: payments.map((p) => ({ method: p.method, amount: Math.round(p.amount) })),
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
        data: {
          itemsCount: items.length,
          warehouseId,
          subtotal,
          discountAmount,
          total,
          paymentsCount: payments.length,
        },
      },
    });

    return created;
  });

  return NextResponse.json({ ok: true, saleId: sale.id });
  } catch (e: any) {
    return bad(typeof e?.message === "string" ? e.message : "Błąd");
  }
}
