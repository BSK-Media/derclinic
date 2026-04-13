import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/api-helpers";

export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const [lots, products, warehouses] = await Promise.all([
    prisma.productLot.findMany({
      include: {
        product: true,
        warehouse: true,
      },
      orderBy: [{ expiryDate: "asc" }, { product: { name: "asc" } }],
    }),
    prisma.product.findMany({ include: { stocks: true } }),
    prisma.warehouse.findMany({ orderBy: { name: "asc" } }),
  ]);

  const totalValue = lots.reduce((sum, lot) => sum + ((lot.purchasePrice ?? 0) * Number(lot.quantity)), 0);
  const lowStockCount = products.filter((p) => p.stocks.reduce((s, st) => s + Number(st.quantity), 0) <= 2).length;
  const shortExpiryCount = lots.filter((lot) => {
    const diff = lot.expiryDate.getTime() - Date.now();
    return diff > 0 && diff <= 1000 * 60 * 60 * 24 * 120;
  }).length;

  return NextResponse.json({
    ok: true,
    lots,
    productsCount: products.length,
    warehousesCount: warehouses.length,
    kpis: {
      totalValue,
      lowStockCount,
      shortExpiryCount,
      lotsCount: lots.length,
    },
  });
}
