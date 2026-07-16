import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";

const BodySchema = z.object({
  productId: z.string().min(1),
  warehouseId: z.string().optional().or(z.literal("")),
  quantity: z.number(),
  kind: z.enum(["APPOINTMENT", "INTERNAL", "SALE"]).optional(),
  note: z.string().optional().or(z.literal("")),
});

const PatchSchema = z.object({
  consumptionId: z.string().min(1),
  quantity: z.number().positive(),
});

async function loadAppointmentConsumption(appointmentId: string, consumptionId: string) {
  const consumption = await prisma.consumption.findUnique({ where: { id: consumptionId } });
  if (!consumption || consumption.appointmentId !== appointmentId) {
    return {
      error: NextResponse.json({ ok: false, message: "Nie znaleziono zużycia" }, { status: 404 }),
    };
  }
  return { consumption };
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN", "RECEPTION"]);
  if (deny) return deny;

  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success)
    return NextResponse.json({ ok: false, message: "Niepoprawne dane" }, { status: 400 });

  const appt = await prisma.appointment.findUnique({ where: { id: params.id } });
  if (!appt)
    return NextResponse.json({ ok: false, message: "Nie znaleziono wizyty" }, { status: 404 });

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
      create: {
        productId: parsed.data.productId,
        warehouseId,
        quantity: new Prisma.Decimal(0).minus(parsed.data.quantity),
      },
    });
  }

  await logAudit({
    actorId: user!.id,
    action: "CREATE",
    entity: "Consumption",
    entityId: c.id,
    data: { appointmentId: appt.id },
  });

  return NextResponse.json({ ok: true, consumption: c });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN", "RECEPTION"]);
  if (deny) return deny;

  const json = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: "Niepoprawne dane" }, { status: 400 });
  }

  const { consumption, error: loadError } = await loadAppointmentConsumption(
    params.id,
    parsed.data.consumptionId,
  );
  if (loadError) return loadError;

  const newQuantity = new Prisma.Decimal(parsed.data.quantity);
  const stockDelta = newQuantity.minus(consumption!.quantity);
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.consumption.update({
      where: { id: consumption!.id },
      data: { quantity: newQuantity },
    });
    if (consumption!.warehouseId && !stockDelta.isZero()) {
      await tx.stock.upsert({
        where: {
          productId_warehouseId: {
            productId: consumption!.productId,
            warehouseId: consumption!.warehouseId,
          },
        },
        update: { quantity: { decrement: stockDelta } },
        create: {
          productId: consumption!.productId,
          warehouseId: consumption!.warehouseId,
          quantity: new Prisma.Decimal(0).minus(stockDelta),
        },
      });
    }
    return row;
  });

  await logAudit({
    actorId: user!.id,
    action: "UPDATE",
    entity: "Consumption",
    entityId: updated.id,
    data: { appointmentId: params.id, quantity: parsed.data.quantity },
  });

  return NextResponse.json({ ok: true, consumption: updated });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN", "RECEPTION"]);
  if (deny) return deny;

  const consumptionId = new URL(req.url).searchParams.get("consumptionId");
  if (!consumptionId) {
    return NextResponse.json({ ok: false, message: "Brak consumptionId" }, { status: 400 });
  }
  const { consumption, error: loadError } = await loadAppointmentConsumption(
    params.id,
    consumptionId,
  );
  if (loadError) return loadError;

  await prisma.$transaction(async (tx) => {
    await tx.consumption.delete({ where: { id: consumption!.id } });
    if (consumption!.warehouseId) {
      await tx.stock.upsert({
        where: {
          productId_warehouseId: {
            productId: consumption!.productId,
            warehouseId: consumption!.warehouseId,
          },
        },
        update: { quantity: { increment: consumption!.quantity } },
        create: {
          productId: consumption!.productId,
          warehouseId: consumption!.warehouseId,
          quantity: consumption!.quantity,
        },
      });
    }
  });

  await logAudit({
    actorId: user!.id,
    action: "DELETE",
    entity: "Consumption",
    entityId: consumption!.id,
    data: { appointmentId: params.id },
  });

  return NextResponse.json({ ok: true });
}
