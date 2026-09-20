import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/api-helpers";
import { logAudit, diffFields } from "@/lib/audit";
import { formatPLNFromGrosze } from "@/lib/money";

const PatchSchema = z.object({
  name: z.string().min(2).optional(),
  sku: z.string().optional().or(z.literal("")).optional(),
  ean: z.string().optional().or(z.literal("")).optional(),
  unit: z.enum(["UNIT", "ML", "AMPULE", "BOTOX_UNIT"]).optional(),
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
      stocks: { where: user!.locationScopeId ? { warehouse: { locationId: user!.locationScopeId } } : {}, include: { warehouse: true }, orderBy: { warehouse: { name: "asc" } } },
      lots: { where: user!.locationScopeId ? { warehouse: { locationId: user!.locationScopeId } } : {}, include: { warehouse: true }, orderBy: [{ expiryDate: "asc" }, { warehouse: { name: "asc" } }] },
      serviceSuggestions: {
        include: { service: { select: { id: true, name: true, category: true } } },
        orderBy: { service: { name: "asc" } },
      },
    },
  });

  if (!product) return NextResponse.json({ ok: false, message: "Nie znaleziono produktu" }, { status: 404 });

  // Katalog zabiegów do wyszukiwarki "dodaj zabieg do preparatu"
  const services = await prisma.service.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, category: true },
  });

  return NextResponse.json({ ok: true, product, services });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const json = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, message: "Niepoprawne dane" }, { status: 400 });

  const before = await prisma.product.findUnique({
    where: { id: params.id },
    select: {
      name: true,
      sku: true,
      ean: true,
      unit: true,
      manufacturer: true,
      catalogCategory: true,
      purchasePrice: true,
      salePrice: true,
      isActive: true,
    },
  });

  const updated = await prisma.$transaction(async (tx) => {
    const product = await tx.product.update({
      where: { id: params.id },
      data: {
        name: parsed.data.name,
        sku: parsed.data.sku === undefined ? undefined : (parsed.data.sku ? parsed.data.sku : null),
        ean: parsed.data.ean === undefined ? undefined : (parsed.data.ean ? parsed.data.ean : null),
        unit: parsed.data.unit as any,
        manufacturer: parsed.data.manufacturer === undefined ? undefined : parsed.data.manufacturer,
        catalogCategory: parsed.data.catalogCategory === undefined ? undefined : parsed.data.catalogCategory,
        purchasePrice: parsed.data.purchasePrice === undefined ? undefined : parsed.data.purchasePrice,
        salePrice: parsed.data.salePrice === undefined ? undefined : parsed.data.salePrice,
        isActive: parsed.data.isActive,
      },
    });

    if (parsed.data.unit !== undefined) {
      await tx.serviceSuggestedProduct.updateMany({
        where: { productId: params.id },
        data: { unit: parsed.data.unit as any },
      });
    }

    return product;
  });

  const changes = before
    ? diffFields(before, {
        name: updated.name,
        sku: updated.sku,
        ean: updated.ean,
        unit: updated.unit,
        manufacturer: updated.manufacturer,
        catalogCategory: updated.catalogCategory,
        purchasePrice: updated.purchasePrice,
        salePrice: updated.salePrice,
        isActive: updated.isActive,
      })
    : undefined;
  const labels: Record<string, string> = {
    name: "nazwa",
    sku: "SKU",
    ean: "EAN",
    unit: "jednostka",
    manufacturer: "producent",
    catalogCategory: "kategoria",
    purchasePrice: "cena zakupu",
    salePrice: "cena sprzedaży",
    isActive: "aktywny",
  };
  const show = (key: string, value: unknown) =>
    typeof value === "number" && (key === "purchasePrice" || key === "salePrice")
      ? formatPLNFromGrosze(value)
      : typeof value === "boolean"
        ? value
          ? "Tak"
          : "Nie"
        : value === null || value === undefined || value === ""
          ? "—"
          : String(value);
  const parts = Object.entries(changes ?? {}).map(
    ([key, change]) => `${labels[key] ?? key}: ${show(key, change.from)} → ${show(key, change.to)}`,
  );
  await logAudit({
    actorId: user!.id,
    action: "UPDATE",
    entity: "Product",
    entityId: updated.id,
    summary: `Zmiana produktu „${updated.name}": ${parts.length ? parts.join("; ") : "bez zmian wartości"}`,
    data: { changes },
  });

  return NextResponse.json({ ok: true, product: updated });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const target = await prisma.product.findUnique({
    where: { id: params.id },
    select: { name: true, sku: true, unit: true },
  });
  await prisma.product.delete({ where: { id: params.id } });
  await logAudit({
    actorId: user!.id,
    action: "DELETE",
    entity: "Product",
    entityId: params.id,
    summary: `Usunięcie produktu „${target?.name ?? params.id}"`,
    data: target ?? undefined,
  });

  return NextResponse.json({ ok: true });
}
