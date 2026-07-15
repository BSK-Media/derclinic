import { ConsumptionKind } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/api-helpers";

const WOS_WEEKS = 10;
const LOW_STOCK_DAYS = 14;

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const warehouse = await prisma.warehouse.findUnique({ where: { id: params.id } });
  if (!warehouse) {
    return NextResponse.json({ ok: false, message: "Nie znaleziono magazynu" }, { status: 404 });
  }

  const tenWeeksAgo = new Date();
  tenWeeksAgo.setDate(tenWeeksAgo.getDate() - WOS_WEEKS * 7);

  const sixMonthsFromNow = new Date();
  sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6);

  const [stocks, lots, consumptions, warehouses, catalogProducts] = await Promise.all([
    prisma.stock.findMany({
      where: { warehouseId: params.id, quantity: { gt: 0 } },
      include: { product: true },
      orderBy: { product: { name: "asc" } },
    }),
    prisma.productLot.findMany({
      where: { warehouseId: params.id, quantity: { gt: 0 } },
      orderBy: [{ expiryDate: "asc" }, { createdAt: "asc" }],
    }),
    prisma.consumption.findMany({
      where: {
        warehouseId: params.id,
        createdAt: { gte: tenWeeksAgo },
        kind: { in: [ConsumptionKind.APPOINTMENT, ConsumptionKind.SALE] },
      },
      select: { productId: true, quantity: true },
    }),
    prisma.warehouse.findMany({ orderBy: { name: "asc" } }),
    prisma.product.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        sku: true,
        manufacturer: true,
        catalogCategory: true,
        purchasePrice: true,
        salePrice: true,
        unit: true,
      },
      orderBy: [{ manufacturer: "asc" }, { name: "asc" }],
    }),
  ]);

  const usedByProduct = new Map<string, number>();
  for (const consumption of consumptions) {
    usedByProduct.set(
      consumption.productId,
      (usedByProduct.get(consumption.productId) ?? 0) + Number(consumption.quantity),
    );
  }

  const lotsByProduct = new Map<string, typeof lots>();
  for (const lot of lots) {
    const productLots = lotsByProduct.get(lot.productId) ?? [];
    productLots.push(lot);
    lotsByProduct.set(lot.productId, productLots);
  }

  const products = stocks.map((stock) => {
    const quantity = Number(stock.quantity);
    const productLots = lotsByProduct.get(stock.productId) ?? [];
    const nearestExpiry = productLots[0]?.expiryDate ?? null;
    const used = usedByProduct.get(stock.productId) ?? 0;
    const weeklyUsage = used / WOS_WEEKS;
    const coverageDays = weeklyUsage > 0 ? (quantity / weeklyUsage) * 7 : null;
    const isLowStock = coverageDays != null && coverageDays < LOW_STOCK_DAYS;
    const isShortExpiry = nearestExpiry != null && nearestExpiry.getTime() <= sixMonthsFromNow.getTime();

    const status = quantity <= 0 ? "Brak" : isLowStock ? "Niski stan" : "Aktywny";

    return {
      productId: stock.productId,
      sku: stock.product.sku ?? stock.product.id.slice(0, 8),
      name: stock.product.name,
      manufacturer: stock.product.manufacturer,
      ean: stock.product.ean,
      catalogCategory: stock.product.catalogCategory,
      quantity,
      purchasePrice: stock.product.purchasePrice,
      salePrice: stock.product.salePrice,
      expiryDate: nearestExpiry,
      lotsCount: productLots.length,
      weeklyUsage,
      coverageDays,
      isLowStock,
      isShortExpiry,
      status,
    };
  });

  const shortExpiryCount = products.filter((product) => product.isShortExpiry).length;

  return NextResponse.json({
    ok: true,
    warehouse,
    warehouses,
    catalogProducts,
    products,
    kpis: {
      totalValue: products.reduce(
        (sum, product) => sum + product.quantity * (product.purchasePrice ?? 0),
        0,
      ),
      totalQuantity: products.reduce((sum, product) => sum + product.quantity, 0),
      lowStockCount: products.filter((product) => product.isLowStock).length,
      shortExpiryCount,
    },
    settings: {
      wosWeeks: WOS_WEEKS,
      lowStockDays: LOW_STOCK_DAYS,
      shortExpiryMonths: 6,
    },
  });
}
