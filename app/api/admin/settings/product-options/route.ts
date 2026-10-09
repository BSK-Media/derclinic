import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";

const MANAGE_ROLES = ["ADMIN", "MANAGER", "RECEPTION"];

// Kategorie = zapisane na liście + te, które już występują przy produktach.
// Jednostki własne = lista z ustawień (jednostki wbudowane są w kodzie).
export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;

  const [saved, used, units] = await Promise.all([
    prisma.productCategoryOption.findMany({ orderBy: { name: "asc" } }),
    prisma.product.findMany({
      where: { catalogCategory: { not: null } },
      select: { catalogCategory: true },
      distinct: ["catalogCategory"],
    }),
    prisma.productUnitOption.findMany({ orderBy: { name: "asc" } }),
  ]);

  const names = new Map<string, { id: string | null; name: string }>();
  for (const c of saved) names.set(c.name.toLowerCase(), { id: c.id, name: c.name });
  for (const p of used) {
    const name = p.catalogCategory?.trim();
    if (name && !names.has(name.toLowerCase())) names.set(name.toLowerCase(), { id: null, name });
  }
  const categories = [...names.values()].sort((a, b) => a.name.localeCompare(b.name, "pl"));

  return NextResponse.json({ ok: true, categories, units: units.map((u) => ({ id: u.id, name: u.name })) });
}

const PostSchema = z.object({
  kind: z.enum(["category", "unit"]),
  name: z.string().trim().min(1, "Podaj nazwę").max(60, "Nazwa jest za długa"),
});

export async function POST(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, MANAGE_ROLES);
  if (deny) return deny;

  const parsed = PostSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: parsed.error.issues[0]?.message ?? "Niepoprawne dane" }, { status: 400 });
  }
  const { kind, name } = parsed.data;
  const model = kind === "category" ? prisma.productCategoryOption : prisma.productUnitOption;
  const existing = await (model as any).findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
  if (existing) {
    return NextResponse.json({ ok: false, message: "Taka pozycja już istnieje" }, { status: 409 });
  }
  const created = await (model as any).create({ data: { name } });
  await logAudit({
    actorId: user!.id,
    action: "CREATE",
    entity: kind === "category" ? "ProductCategoryOption" : "ProductUnitOption",
    entityId: created.id,
    summary: `${kind === "category" ? "Nowa kategoria produktów" : "Nowa jednostka miary"} „${name}”`,
  });
  return NextResponse.json({ ok: true, option: { id: created.id, name: created.name } });
}

export async function DELETE(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, MANAGE_ROLES);
  if (deny) return deny;

  const url = new URL(req.url);
  const kind = url.searchParams.get("kind");
  const id = url.searchParams.get("id");
  if (!id || (kind !== "category" && kind !== "unit")) {
    return NextResponse.json({ ok: false, message: "Niepoprawne dane" }, { status: 400 });
  }

  // Usunięcie z listy nie zmienia produktów, które już mają tę wartość.
  if (kind === "category") await prisma.productCategoryOption.deleteMany({ where: { id } });
  else await prisma.productUnitOption.deleteMany({ where: { id } });

  await logAudit({
    actorId: user!.id,
    action: "DELETE",
    entity: kind === "category" ? "ProductCategoryOption" : "ProductUnitOption",
    entityId: id,
    summary: kind === "category" ? "Usunięto kategorię produktów z listy" : "Usunięto jednostkę miary z listy",
  });
  return NextResponse.json({ ok: true });
}
