import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";

const PatchSchema = z.object({
  name: z.string().min(2).optional(),
  sku: z.string().optional().or(z.literal("")).optional(),
  manufacturer: z.string().optional().nullable(),
  catalogCategory: z.string().optional().nullable(),
  purchasePrice: z.number().int().optional().nullable(),
  salePrice: z.number().int().optional().nullable(),
  isActive: z.boolean().optional(),
});

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const product = await prisma.product.findUnique({
    where: { id: params.id },
    include: {
      stocks: { include: { warehouse: true }, orderBy: { warehouse: { name: "asc" } } },
      lots: { include: { warehouse: true }, orderBy: [{ expiryDate: "asc" }, { warehouse: { name: "asc" } }] },
    },
  });

  if (!product) return NextResponse.json({ ok: false, message: "Nie znaleziono produktu" }, { status: 404 });
  return NextResponse.json({ ok: true, product });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const json = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, message: "Niepoprawne dane" }, { status: 400 });

  const updated = await prisma.product.update({
    where: { id: params.id },
    data: {
      name: parsed.data.name,
      sku: parsed.data.sku === undefined ? undefined : (parsed.data.sku ? parsed.data.sku : null),
      manufacturer: parsed.data.manufacturer === undefined ? undefined : parsed.data.manufacturer,
      catalogCategory: parsed.data.catalogCategory === undefined ? undefined : parsed.data.catalogCategory,
      purchasePrice: parsed.data.purchasePrice === undefined ? undefined : parsed.data.purchasePrice,
      salePrice: parsed.data.salePrice === undefined ? undefined : parsed.data.salePrice,
      isActive: parsed.data.isActive,
    },
  });

  await logAudit({ actorId: user!.id, action: "UPDATE", entity: "Product", entityId: updated.id });

  return NextResponse.json({ ok: true, product: updated });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  await prisma.product.delete({ where: { id: params.id } });
  await logAudit({ actorId: user!.id, action: "DELETE", entity: "Product", entityId: params.id });

  return NextResponse.json({ ok: true });
}
