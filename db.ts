import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";

const CreateSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number(),
  unit: z.enum(["UNIT", "ML", "AMPULE", "BOTOX_UNIT"]).optional(),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const json = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, message: "Niepoprawne dane" }, { status: 400 });

  const row = await prisma.serviceSuggestedProduct.upsert({
    where: { serviceId_productId: { serviceId: params.id, productId: parsed.data.productId } },
    update: { quantity: new Prisma.Decimal(parsed.data.quantity), unit: (parsed.data.unit ?? "UNIT") as any },
    create: { serviceId: params.id, productId: parsed.data.productId, quantity: new Prisma.Decimal(parsed.data.quantity), unit: (parsed.data.unit ?? "UNIT") as any },
    include: { product: true },
  });

  await logAudit({ actorId: user!.id, action: "UPSERT", entity: "ServiceSuggestedProduct", entityId: row.id });

  return NextResponse.json({ ok: true, suggestion: row });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const url = new URL(req.url);
  const productId = url.searchParams.get("productId");
  if (!productId) return NextResponse.json({ ok: false, message: "Brak productId" }, { status: 400 });

  await prisma.serviceSuggestedProduct.delete({
    where: { serviceId_productId: { serviceId: params.id, productId } },
  });

  await logAudit({ actorId: user!.id, action: "DELETE", entity: "ServiceSuggestedProduct", entityId: `${params.id}:${productId}` });

  return NextResponse.json({ ok: true });
}
