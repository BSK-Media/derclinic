import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";

export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireRole(user!.role, ["ADMIN", "RECEPTION"]);
  if (deny) return deny;

  const [services, products] = await Promise.all([
    prisma.service.findMany({
      orderBy: { name: "asc" },
      include: { suggestedProducts: { include: { product: true } } },
    }),
    prisma.product.findMany({ orderBy: { name: "asc" } }),
  ]);

  return NextResponse.json({ ok: true, services, products });
}

const CreateSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional().or(z.literal("")),
  durationMin: z.number().int().min(5).max(480).optional(),
  priceFrom: z.number().int().optional().nullable(),
  priceSuggested: z.number().int().optional().nullable(),
});

export async function POST(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const json = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, message: "Niepoprawne dane" }, { status: 400 });

  const s = await prisma.service.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description ? parsed.data.description : null,
      durationMin: parsed.data.durationMin ?? 30,
      priceFrom: parsed.data.priceFrom ?? null,
      priceSuggested: parsed.data.priceSuggested ?? null,
    },
  });

  await logAudit({ actorId: user!.id, action: "CREATE", entity: "Service", entityId: s.id });

  return NextResponse.json({ ok: true, service: s });
}
