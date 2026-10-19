import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";

// Archiwum (Ustawienia → Archiwum): usługi i konta pracowników, które zostają w historii wizyt,
// ale nie pojawiają się na zwykłych listach (usługi, specjaliści, kalendarz, rozliczenia, rezerwacje).
export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN", "MANAGER"]);
  if (deny) return deny;

  const [services, specialists] = await Promise.all([
    prisma.service.findMany({
      where: { isArchived: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, category: true, durationMin: true },
    }),
    prisma.user.findMany({
      where: { isArchived: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, role: true },
    }),
  ]);

  const [byService, bySpecialist] = await Promise.all([
    services.length
      ? prisma.appointment.groupBy({ by: ["serviceId"], where: { serviceId: { in: services.map((s) => s.id) } }, _count: { _all: true } })
      : [],
    specialists.length
      ? prisma.appointment.groupBy({ by: ["specialistId"], where: { specialistId: { in: specialists.map((s) => s.id) } }, _count: { _all: true } })
      : [],
  ]);
  const serviceCount = new Map(byService.map((r) => [r.serviceId, r._count._all]));
  const specialistCount = new Map(bySpecialist.map((r) => [r.specialistId, r._count._all]));

  return NextResponse.json({
    ok: true,
    services: services.map((s) => ({ ...s, visits: serviceCount.get(s.id) ?? 0 })),
    specialists: specialists.map((s) => ({ ...s, visits: specialistCount.get(s.id) ?? 0 })),
  });
}

const RestoreSchema = z.object({ serviceId: z.string().min(1).max(100) });

// Przywrócenie usługi z archiwum (wraca na listy usług; do rezerwacji online trzeba ją jeszcze przypisać specjalistom).
export async function POST(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN"]);
  if (deny) return deny;
  const parsed = RestoreSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, message: "Niepoprawne dane" }, { status: 400 });

  const service = await prisma.service.findFirst({
    where: { id: parsed.data.serviceId, isArchived: true },
    select: { id: true, name: true },
  });
  if (!service) return NextResponse.json({ ok: false, message: "Nie znaleziono usługi w archiwum" }, { status: 404 });

  await prisma.service.update({ where: { id: service.id }, data: { isArchived: false } });
  await logAudit({
    actorId: user!.id,
    action: "UPDATE",
    entity: "Service",
    entityId: service.id,
    summary: `Przywrócono usługę z archiwum: ${service.name}`,
  });
  return NextResponse.json({ ok: true });
}
