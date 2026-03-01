import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";

export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const [products, warehouses] = await Promise.all([
    prisma.product.findMany({
      orderBy: { name: "asc" },
      include: { stocks: true },
    }),
    prisma.warehouse.findMany({ orderBy: { name: "asc" } }),
  ]);

  return NextResponse.json({ ok: true, products, warehouses });
}

const CreateSchema = z.object({
  category: z.enum(["PREPARATION", "COSMETIC"]),
  name: z.string().min(2),
  sku: z.string().optional().or(z.literal("")),
  unit: z.enum(["UNIT", "ML", "AMPULE", "BOTOX_UNIT"]),
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
      purchasePrice: parsed.data.purchasePrice ?? null,
      salePrice: parsed.data.salePrice ?? null,
    },
  });

  await logAudit({ actorId: user!.id, action: "CREATE", entity: "Product", entityId: p.id });

  return NextResponse.json({ ok: true, product: p });
}
