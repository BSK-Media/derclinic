import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireRole(user!.role, ["ADMIN", "RECEPTION", "SPECIALIST"]);
  if (deny) return deny;

  const appt = await prisma.appointment.findUnique({
    where: { id: params.id },
    include: {
      patient: true,
      specialist: { select: { id: true, name: true, login: true, payoutPercent: true } },
      service: { include: { suggestedProducts: { include: { product: true } } } },
      consumptions: { include: { product: true, warehouse: true, createdBy: { select: { name: true, login: true } } } },
      payments: true,
    },
  });

  if (!appt) return NextResponse.json({ ok: false, message: "Nie znaleziono" }, { status: 404 });

  const [products, warehouses] = await Promise.all([
    prisma.product.findMany({ orderBy: { name: "asc" } }),
    prisma.warehouse.findMany({ orderBy: { name: "asc" } }),
  ]);

  return NextResponse.json({ ok: true, appointment: appt, products, warehouses });
}

const PatchSchema = z.object({
  status: z.enum(["SCHEDULED", "COMPLETED", "CANCELED", "NO_SHOW"]).optional(),
  priceFinal: z.number().int().optional().nullable(),
  priceEstimate: z.number().int().optional().nullable(),
  note: z.string().optional().or(z.literal("")),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireRole(user!.role, ["ADMIN", "RECEPTION", "SPECIALIST"]);
  if (deny) return deny;

  const json = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, message: "Niepoprawne dane" }, { status: 400 });

  // Specialists can only edit their own appointments
  const existing = await prisma.appointment.findUnique({ where: { id: params.id }, select: { id: true, specialistId: true } });
  if (!existing) return NextResponse.json({ ok: false, message: "Nie znaleziono" }, { status: 404 });
  if (user!.role === "SPECIALIST" && existing.specialistId !== user!.id) {
    return NextResponse.json({ ok: false, message: "Brak uprawnień" }, { status: 403 });
  }

  const appt = await prisma.appointment.update({
    where: { id: params.id },
    data: {
      status: parsed.data.status as any,
      priceFinal: parsed.data.priceFinal === undefined ? undefined : parsed.data.priceFinal,
      priceEstimate: parsed.data.priceEstimate === undefined ? undefined : parsed.data.priceEstimate,
      note: parsed.data.note === undefined ? undefined : (parsed.data.note ? parsed.data.note : null),
    },
  });

  await logAudit({ actorId: user!.id, action: "UPDATE", entity: "Appointment", entityId: appt.id, data: parsed.data });

  return NextResponse.json({ ok: true, appointment: appt });
}
