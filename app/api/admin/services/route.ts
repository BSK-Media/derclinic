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

  const [services, products, specialists] = await Promise.all([
    prisma.service.findMany({
      orderBy: { name: "asc" },
      include: {
        suggestedProducts: { include: { product: true } },
        specialistAssignments: { select: { specialistId: true } },
      },
    }),
    prisma.product.findMany({ orderBy: { name: "asc" } }),
    prisma.user.findMany({
      where: { role: "SPECIALIST" },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return NextResponse.json({ ok: true, services, products, specialists });
}

const CreateSchema = z.object({
  name: z.string().min(2),
  category: z.string().optional().nullable(),
  description: z.string().optional().or(z.literal("")),
  durationMin: z.number().int().min(5).max(480).optional(),
  priceFrom: z.number().int().optional().nullable(),
  priceSuggested: z.number().int().optional().nullable(),
  specialistIds: z.array(z.string().min(1)).optional(),
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
      category: parsed.data.category ? parsed.data.category : null,
      description: parsed.data.description ? parsed.data.description : null,
      durationMin: parsed.data.durationMin ?? 30,
      priceFrom: parsed.data.priceFrom ?? null,
      priceSuggested: parsed.data.priceSuggested ?? null,
    },
  });

  // Przypisanie usługi wskazanym specjalistom (tylko istniejącym, rola SPECIALIST)
  const specialistIds = [...new Set(parsed.data.specialistIds ?? [])];
  if (specialistIds.length > 0) {
    const validSpecialists = await prisma.user.findMany({
      where: { id: { in: specialistIds }, role: "SPECIALIST" },
      select: { id: true },
    });
    if (validSpecialists.length > 0) {
      await prisma.specialistService.createMany({
        data: validSpecialists.map((sp) => ({ specialistId: sp.id, serviceId: s.id })),
        skipDuplicates: true,
      });
    }
  }

  await logAudit({ actorId: user!.id, action: "CREATE", entity: "Service", entityId: s.id, data: { specialistIds } });

  return NextResponse.json({ ok: true, service: s });
}
