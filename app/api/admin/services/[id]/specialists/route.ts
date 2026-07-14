import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";

const PutSchema = z.object({
  specialistId: z.string().min(1),
  assigned: z.boolean(),
});

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const json = await req.json().catch(() => null);
  const parsed = PutSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, message: "Niepoprawne dane" }, { status: 400 });

  const [service, specialist] = await Promise.all([
    prisma.service.findUnique({ where: { id: params.id }, select: { id: true } }),
    prisma.user.findUnique({ where: { id: parsed.data.specialistId }, select: { id: true, role: true } }),
  ]);
  if (!service) return NextResponse.json({ ok: false, message: "Nie znaleziono usługi" }, { status: 404 });
  if (!specialist || specialist.role !== "SPECIALIST") {
    return NextResponse.json({ ok: false, message: "Nie znaleziono specjalisty" }, { status: 404 });
  }

  if (parsed.data.assigned) {
    await prisma.specialistService.upsert({
      where: { specialistId_serviceId: { specialistId: specialist.id, serviceId: service.id } },
      update: {},
      create: { specialistId: specialist.id, serviceId: service.id },
    });
  } else {
    await prisma.specialistService.deleteMany({
      where: { specialistId: specialist.id, serviceId: service.id },
    });
  }

  await logAudit({
    actorId: user!.id,
    action: "UPDATE",
    entity: "SpecialistService",
    entityId: `${specialist.id}:${service.id}`,
    data: { assigned: parsed.data.assigned },
  });

  return NextResponse.json({ ok: true, specialistId: specialist.id, serviceId: service.id, assigned: parsed.data.assigned });
}
