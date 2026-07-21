import { ConsumptionKind } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole, scopedLocationWhere } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";

const WOS_WEEKS = 10;

export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const wosStart = new Date();
  wosStart.setDate(wosStart.getDate() - WOS_WEEKS * 7);
  const warehouseRelationWhere = user!.locationScopeId
    ? { warehouse: { locationId: user!.locationScopeId } }
    : {};

  const [products, warehouses, consumptions] = await Promise.all([
    prisma.product.findMany({
      orderBy: [{ manufacturer: "asc" }, { name: "asc" }],
      include: {
        stocks: {
          where: warehouseRelationWhere,
          include: { warehouse: { select: { id: true, name: true } } },
          orderBy: { warehouse: { name: "asc" } },
        },
        lots: {
          where: { quantity: { gt: 0 }, ...warehouseRelationWhere },
          include: { warehouse: { select: { id: true, name: true } } },
          orderBy: [{ expiryDate: "asc" }, { createdAt: "asc" }],
        },
      },
    }),
    prisma.warehouse.findMany({
      where: scopedLocationWhere(user!),
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.consumption.findMany({
      where: {
        createdAt: { gte: wosStart },
        kind: { in: [ConsumptionKind.APPOINTMENT, ConsumptionKind.SALE] },
        ...warehouseRelationWhere,
      },
      select: { productId: true, quantity: true },
    }),
  ]);

  const usedByProduct = new Map<string, number>();
  for (const consumption of consumptions) {
    usedByProduct.set(
      consumption.productId,
      (usedByProduct.get(consumption.productId) ?? 0) + Number(consumption.quantity),
    );
  }

  const productsWithWos = products.map((product) => {
    const stock = product.stocks.reduce((sum, item) => sum + Number(item.quantity), 0);
    const weeklyUsage = (usedByProduct.get(product.id) ?? 0) / WOS_WEEKS;

    return {
      ...product,
      wosWeeks: weeklyUsage > 0 ? stock / weeklyUsage : null,
    };
  });

  return NextResponse.json({ ok: true, products: productsWithWos, warehouses });
}

const CreateSchema = z.object({
  category: z.enum(["PREPARATION", "COSMETIC"]),
  name: z.string().min(2),
  sku: z.string().optional().or(z.literal("")),
  unit: z.enum(["UNIT", "ML", "AMPULE", "BOTOX_UNIT"]),
  manufacturer: z.string().optional().nullable(),
  catalogCategory: z.string().optional().nullable(),
  purchasePrice: z.number().int().optional().nullable(),
  salePrice: z.number().int().optional().nullable(),
});

export async function POST(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const json = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, message: "Niepoprawne dane" }, { status: 400 });

  const p = await prisma.product.create({
    data: {
      category: parsed.data.category as any,
      name: parsed.data.name,
      sku: parsed.data.sku ? parsed.data.sku : null,
      unit: parsed.data.unit as any,
      manufacturer: parsed.data.manufacturer ?? null,
      catalogCategory: parsed.data.catalogCategory ?? null,
      purchasePrice: parsed.data.purchasePrice ?? null,
      salePrice: parsed.data.salePrice ?? null,
    },
  });

  await logAudit({ actorId: user!.id, action: "CREATE", entity: "Product", entityId: p.id });

  return NextResponse.json({ ok: true, product: p });
}
