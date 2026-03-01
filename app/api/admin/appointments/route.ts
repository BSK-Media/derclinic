import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";

export async function GET(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireRole(user!.role, ["ADMIN", "RECEPTION"]);
  if (deny) return deny;

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  const fromDt = from ? new Date(from) : new Date(Date.now() - 1000 * 60 * 60 * 24 * 7);
  const toDt = to ? new Date(to) : new Date(Date.now() + 1000 * 60 * 60 * 24 * 14);

  const [appointments, patients, specialists, services] = await Promise.all([
    prisma.appointment.findMany({
      where: { startsAt: { gte: fromDt, lt: toDt } },
      orderBy: { startsAt: "asc" },
      include: {
        patient: true,
        specialist: { select: { id: true, name: true, login: true } },
        service: true,
        consumptions: { include: { product: true, warehouse: true } },
        payments: true,
      },
      take: 500,
    }),
    prisma.patient.findMany({ orderBy: { name: "asc" }, take: 500 }),
    prisma.user.findMany({ where: { role: "SPECIALIST" }, orderBy: { name: "asc" } }),
    prisma.service.findMany({ orderBy: { name: "asc" } }),
  ]);

  return NextResponse.json({ ok: true, appointments, patients, specialists, services });
}

const CreateSchema = z.object({
  patientId: z.string().min(1),
  specialistId: z.string().min(1),
  serviceId: z.string().min(1),
  startsAt: z.string().min(1),
  durationMin: z.number().int().min(5).max(480),
  priceEstimate: z.number().int().optional().nullable(),
  note: z.string().optional().or(z.literal("")),
});

export async function POST(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireRole(user!.role, ["ADMIN", "RECEPTION"]);
  if (deny) return deny;

  const json = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, message: "Niepoprawne dane" }, { status: 400 });

  const startsAt = new Date(parsed.data.startsAt);
  const endsAt = new Date(startsAt);
  endsAt.setMinutes(endsAt.getMinutes() + parsed.data.durationMin);

  const appt = await prisma.appointment.create({
    data: {
      patientId: parsed.data.patientId,
      specialistId: parsed.data.specialistId,
      serviceId: parsed.data.serviceId,
      startsAt,
      endsAt,
      priceEstimate: parsed.data.priceEstimate ?? null,
      note: parsed.data.note ? parsed.data.note : null,
    },
  });

  await logAudit({ actorId: user!.id, action: "CREATE", entity: "Appointment", entityId: appt.id });

  return NextResponse.json({ ok: true, appointment: appt });
}
