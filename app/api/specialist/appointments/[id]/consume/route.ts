import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole } from "@/lib/api-helpers";

const BodySchema = z.object({
  productId: z.string().min(1),
  warehouseId: z.string().optional().or(z.literal("")),
  quantity: z.number(),
  note: z.string().optional().or(z.literal("")),
});

async function loadActiveAppointment(appointmentId: string) {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: { id: true, specialistId: true, deletedAt: true },
  });
  if (!appointment || appointment.deletedAt) {
    return {
      error: NextResponse.json({ ok: false, message: "Nie znaleziono wizyty" }, { status: 404 }),
    };
  }
  return { appointment };
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["RECEPTION", "ADMIN"]);
  if (deny) return deny;

  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success)
    return NextResponse.json({ ok: false, message: "Niepoprawne dane" }, { status: 400 });

  const { appointment: appt, error: appointmentError } = await loadActiveAppointment(params.id);
  if (appointmentError) return appointmentError;

  const warehouseId = parsed.data.warehouseId ? parsed.data.warehouseId : null;
  if (!warehouseId)
    return NextResponse.json({ ok: false, message: "Wybierz magazyn" }, { status: 400 });

  const product = await prisma.product.findUnique({
    where: { id: parsed.data.productId },
    select: { id: true, unit: true },
  });
  if (!product)
    return NextResponse.json({ ok: false, message: "Nie znaleziono produktu" }, { status: 404 });

  const c = await prisma.consumption.create({
    data: {
      appointmentId: appt.id,
      specialistId: appt.specialistId,
      productId: parsed.data.productId,
      warehouseId,
      quantity: new Prisma.Decimal(parsed.data.quantity),
      unit: product.unit, // jednostka zawsze z karty produktu (ustala admin)
      kind: "APPOINTMENT",
      createdById: user!.id,
      note: parsed.data.note ? parsed.data.note : null,
    },
  });

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

  return NextResponse.json({ ok: true, consumption: c });
}

const PatchSchema = z.object({
  consumptionId: z.string().min(1),
  quantity: z.number().positive(),
});

async function loadAppointmentConsumption(appointmentId: string, consumptionId: string) {
  const c = await prisma.consumption.findUnique({ where: { id: consumptionId } });
  if (!c || c.appointmentId !== appointmentId)
    return {
      error: NextResponse.json({ ok: false, message: "Nie znaleziono zużycia" }, { status: 404 }),
    };
  return { consumption: c };
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["RECEPTION", "ADMIN"]);
  if (deny) return deny;

  const { error: appointmentError } = await loadActiveAppointment(params.id);
  if (appointmentError) return appointmentError;

  const json = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(json);
  if (!parsed.success)
    return NextResponse.json({ ok: false, message: "Niepoprawne dane" }, { status: 400 });

  const { consumption, error: loadError } = await loadAppointmentConsumption(
    params.id,
    parsed.data.consumptionId,
  );
  if (loadError) return loadError;

  const oldQty = consumption!.quantity;
  const newQty = new Prisma.Decimal(parsed.data.quantity);
  const delta = newQty.minus(oldQty); // o ile więcej schodzi z magazynu

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.consumption.update({
      where: { id: consumption!.id },
      data: { quantity: newQty },
    });
    if (consumption!.warehouseId && !delta.isZero()) {
      await tx.stock.upsert({
        where: {
          productId_warehouseId: {
            productId: consumption!.productId,
            warehouseId: consumption!.warehouseId,
          },
        },
        update: { quantity: { decrement: delta } },
        create: {
          productId: consumption!.productId,
          warehouseId: consumption!.warehouseId,
          quantity: new Prisma.Decimal(0).minus(delta),
        },
      });
    }
    return row;
  });

  return NextResponse.json({ ok: true, consumption: updated });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["RECEPTION", "ADMIN"]);
  if (deny) return deny;

  const { error: appointmentError } = await loadActiveAppointment(params.id);
  if (appointmentError) return appointmentError;

  const url = new URL(req.url);
  const consumptionId = url.searchParams.get("consumptionId");
  if (!consumptionId)
    return NextResponse.json({ ok: false, message: "Brak consumptionId" }, { status: 400 });

  const { consumption, error: loadError } = await loadAppointmentConsumption(
    params.id,
    consumptionId,
  );
  if (loadError) return loadError;

  await prisma.$transaction(async (tx) => {
    await tx.consumption.delete({ where: { id: consumption!.id } });
    // Zwrot zużytej ilości na stan magazynu
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

  return NextResponse.json({ ok: true });
}
