import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireRole(user!.role, ["SPECIALIST", "RECEPTION", "ADMIN"]);
  if (deny) return deny;

  const appt = await prisma.appointment.findUnique({
    where: { id: params.id },
    include: {
      patient: true,
      service: { include: { suggestedProducts: { include: { product: true } } } },
      consumptions: { include: { product: true, warehouse: true } },
      payments: true,
    },
  });
  if (!appt) return NextResponse.json({ ok: false, message: "Nie znaleziono" }, { status: 404 });

  if (user!.role !== "ADMIN" && appt.specialistId !== user!.id) {
    return NextResponse.json({ ok: false, message: "Brak uprawnień" }, { status: 403 });
  }

  const [products, warehouses] = await Promise.all([
    prisma.product.findMany({ orderBy: { name: "asc" } }),
    user!.role === "ADMIN"
      ? prisma.warehouse.findMany({ orderBy: { name: "asc" } })
      : prisma.warehouse.findMany({
          where: { specialistAccess: { some: { specialistId: user!.id } } },
          orderBy: { name: "asc" },
        }),
  ]);

  return NextResponse.json({ ok: true, appointment: appt, products, warehouses });
}

const PatchSchema = z.object({
  status: z.enum(["SCHEDULED", "COMPLETED", "CANCELED", "NO_SHOW"]).optional(),
  priceFinal: z.number().int().optional().nullable(),
  note: z.string().optional().or(z.literal("")),
  startsAt: z.string().datetime({ offset: true }).optional(),
  endsAt: z.string().datetime({ offset: true }).optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireRole(user!.role, ["SPECIALIST", "ADMIN"]);
  if (deny) return deny;

  const json = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, message: "Niepoprawne dane" }, { status: 400 });

  const existing = await prisma.appointment.findUnique({
    where: { id: params.id },
    select: { id: true, specialistId: true },
  });
  if (!existing) return NextResponse.json({ ok: false, message: "Nie znaleziono" }, { status: 404 });
  if (user!.role !== "ADMIN" && existing.specialistId !== user!.id) {
    return NextResponse.json({ ok: false, message: "Brak uprawnień" }, { status: 403 });
  }

  const newStarts = parsed.data.startsAt ? new Date(parsed.data.startsAt) : undefined;
  const newEnds = parsed.data.endsAt ? new Date(parsed.data.endsAt) : undefined;
  if (newStarts && newEnds && newEnds <= newStarts) {
    return NextResponse.json({ ok: false, message: "Koniec wizyty musi być po jej rozpoczęciu." }, { status: 400 });
  }

  const appt = await prisma.appointment.update({
    where: { id: params.id },
    data: {
      status: parsed.data.status as any,
      priceFinal: parsed.data.priceFinal === undefined ? undefined : parsed.data.priceFinal,
      note: parsed.data.note === undefined ? undefined : (parsed.data.note ? parsed.data.note : null),
      startsAt: newStarts,
      endsAt: newEnds,
    },
  });

  await logAudit({ actorId: user!.id, action: "UPDATE", entity: "Appointment", entityId: appt.id, data: parsed.data });

  return NextResponse.json({ ok: true, appointment: appt });
}
