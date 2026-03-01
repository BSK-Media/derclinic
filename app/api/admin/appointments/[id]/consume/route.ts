import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";

const BodySchema = z.object({
  productId: z.string().min(1),
  warehouseId: z.string().optional().or(z.literal("")),
  quantity: z.number(),
  kind: z.enum(["APPOINTMENT", "INTERNAL", "SALE"]).optional(),
  note: z.string().optional().or(z.literal("")),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireRole(user!.role, ["ADMIN", "RECEPTION", "SPECIALIST"]);
  if (deny) return deny;

  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, message: "Niepoprawne dane" }, { status: 400 });

  const appt = await prisma.appointment.findUnique({ where: { id: params.id } });
  if (!appt) return NextResponse.json({ ok: false, message: "Nie znaleziono wizyty" }, { status: 404 });

  // Specialists can only add consumption to their own appointment
  if (user!.role === "SPECIALIST" && appt.specialistId !== user!.id) {
    return NextResponse.json({ ok: false, message: "Brak uprawnień" }, { status: 403 });
  }

  const warehouseId = parsed.data.warehouseId ? parsed.data.warehouseId : null;

  const c = await prisma.consumption.create({
    data: {
      appointmentId: appt.id,
      specialistId: appt.specialistId,
      productId: parsed.data.productId,
      warehouseId,
      quantity: new Prisma.Decimal(parsed.data.quantity),
      kind: (parsed.data.kind ?? "APPOINTMENT") as any,
      createdById: user!.id,
      note: parsed.data.note ? parsed.data.note : null,
    },
  });

  // decrement stock if warehouse specified
  if (warehouseId) {
    await prisma.stock.upsert({
      where: { productId_warehouseId: { productId: parsed.data.productId, warehouseId } },
      update: { quantity: { decrement: new Prisma.Decimal(parsed.data.quantity) } },
      create: { productId: parsed.data.productId, warehouseId, quantity: new Prisma.Decimal(0).minus(parsed.data.quantity) },
    });
  }

  await logAudit({ actorId: user!.id, action: "CREATE", entity: "Consumption", entityId: c.id, data: { appointmentId: appt.id } });

  return NextResponse.json({ ok: true, consumption: c });
}
