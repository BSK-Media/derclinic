import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { effectiveCategoryColors, findSimilarCategoryColor } from "@/lib/category-color";

// Kategoria usługi to nazwa i kolor zapisane przy każdej usłudze tej kategorii —
// edycja zmienia je hurtowo (literówka w nazwie, nowy kolor).
const BodySchema = z
  .object({
    category: z.string().trim().min(1),
    newName: z.string().trim().min(2, "Nazwa kategorii musi mieć co najmniej 2 znaki").max(120).optional(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Niepoprawny kolor").optional(),
  })
  .strict();

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

export async function PATCH(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN", "MANAGER"]);
  if (deny) return deny;

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad(parsed.error.issues[0]?.message ?? "Niepoprawne dane");
  const { category, newName, color } = parsed.data;
  if (newName === undefined && color === undefined) return bad("Nic do zmiany");

  const services = await prisma.service.findMany({
    where: { category: { not: null } },
    select: { category: true, categoryColor: true },
  });
  if (!services.some((service) => service.category === category)) return bad("Nie znaleziono kategorii", 404);

  const names = [...new Set(services.map((service) => service.category!))];
  if (newName && newName !== category) {
    // Ta sama nazwa innej kategorii (bez względu na wielkość liter) połączyłaby dwie kategorie.
    const clash = names.find(
      (name) => name !== category && name.toLocaleLowerCase("pl") === newName.toLocaleLowerCase("pl"),
    );
    if (clash) return bad(`Kategoria „${clash}” już istnieje.`, 409);
  }

  if (color) {
    const similar = findSimilarCategoryColor(color, effectiveCategoryColors(services), category);
    if (similar) return bad(`Ten kolor jest zbyt podobny do kategorii „${similar.name}”. Wybierz inny.`);
  }

  const result = await prisma.service.updateMany({
    where: { category },
    data: {
      ...(newName ? { category: newName } : {}),
      ...(color ? { categoryColor: color } : {}),
    },
  });

  await logAudit({
    actorId: user!.id,
    action: "UPDATE",
    entity: "ServiceCategory",
    summary: `Zmiana kategorii usług „${category}”: ${[
      newName && newName !== category ? `nazwa → „${newName}”` : null,
      color ? `kolor → ${color}` : null,
    ]
      .filter(Boolean)
      .join("; ")} (usług: ${result.count})`,
    data: { category, newName: newName ?? null, color: color ?? null, servicesUpdated: result.count },
  });

  return NextResponse.json({ ok: true, updated: result.count });
}
