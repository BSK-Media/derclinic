import { ConsumptionKind } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/api-helpers";

const WOS_WEEKS = 10;
const LOW_STOCK_DAYS = 14;

export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const tenWeeksAgo = new Date();
  tenWeeksAgo.setDate(tenWeeksAgo.getDate() - WOS_WEEKS * 7);

  const sixMonthsFromNow = new Date();
  sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6);

  const [warehouses, stocks, lots, consumptions] = await Promise.all([
    prisma.warehouse.findMany({
      orderBy: [{ parentId: "asc" }, { name: "asc" }],
    }),
    prisma.stock.findMany({
      where: { quantity: { gt: 0 } },
      include: { product: true },
    }),
    prisma.productLot.findMany({
      where: { quantity: { gt: 0 } },
      select: { warehouseId: true, productId: true, expiryDate: true },
    }),
    prisma.consumption.findMany({
      where: {
        createdAt: { gte: tenWeeksAgo },
        warehouseId: { not: null },
        kind: { in: [ConsumptionKind.APPOINTMENT, ConsumptionKind.SALE] },
      },
      select: { warehouseId: true, productId: true, quantity: true },
    }),
  ]);

  const usedByWarehouseAndProduct = new Map<string, number>();
  for (const consumption of consumptions) {
    if (!consumption.warehouseId) continue;
    const key = `${consumption.warehouseId}:${consumption.productId}`;
    usedByWarehouseAndProduct.set(key, (usedByWarehouseAndProduct.get(key) ?? 0) + Number(consumption.quantity));
  }

  const lotsByWarehouse = new Map<string, typeof lots>();
  for (const lot of lots) {
    const warehouseLots = lotsByWarehouse.get(lot.warehouseId) ?? [];
    warehouseLots.push(lot);
    lotsByWarehouse.set(lot.warehouseId, warehouseLots);
  }

  const summaries = warehouses.map((warehouse) => {
    const warehouseStocks = stocks.filter((stock) => stock.warehouseId === warehouse.id);
    const warehouseLots = lotsByWarehouse.get(warehouse.id) ?? [];
    const stockedProductIds = new Set(warehouseStocks.map((stock) => stock.productId));
    const shortExpiryProductIds = new Set(
      warehouseLots
        .filter((lot) => stockedProductIds.has(lot.productId) && lot.expiryDate.getTime() <= sixMonthsFromNow.getTime())
        .map((lot) => lot.productId),
    );

    const lowStockCount = warehouseStocks.filter((stock) => {
      const used = usedByWarehouseAndProduct.get(`${warehouse.id}:${stock.productId}`) ?? 0;
      const weeklyUsage = used / WOS_WEEKS;
      if (weeklyUsage <= 0) return false;
      const coverageDays = (Number(stock.quantity) / weeklyUsage) * 7;
      return coverageDays < LOW_STOCK_DAYS;
    }).length;

    return {
      id: warehouse.id,
      name: warehouse.name,
      parentId: warehouse.parentId,
      totalQuantity: warehouseStocks.reduce((sum, stock) => sum + Number(stock.quantity), 0),
      totalValue: warehouseStocks.reduce(
        (sum, stock) => sum + Number(stock.quantity) * (stock.product.purchasePrice ?? 0),
        0,
      ),
      productsCount: warehouseStocks.length,
      lowStockCount,
      shortExpiryCount: shortExpiryProductIds.size,
    };
  });

  return NextResponse.json({ ok: true, warehouses: summaries });
}
