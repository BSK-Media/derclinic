import { Prisma, type PrismaClient } from "@prisma/client";
import { logAudit } from "@/lib/audit";
import { applyLotChange } from "@/lib/lot-allocation";

type Db = PrismaClient | Prisma.TransactionClient;

export type AppointmentConsumptionInput = {
  appointment: { id: string; specialistId: string | null; patient: { name: string } };
  product: { id: string; name: string; unit: Prisma.ConsumptionCreateInput["unit"] };
  warehouseId: string | null;
  quantity: number;
  kind?: "APPOINTMENT" | "INTERNAL" | "SALE";
  note?: string | null;
  actorId: string;
};

/**
 * Zapis zużycia preparatu na wizycie: wpis Consumption, zejście ze stanu magazynu
 * (gdy wskazano magazyn), przypisanie partii (FEFO) i wpis w dzienniku.
 */
export async function recordAppointmentConsumption(db: Db, input: AppointmentConsumptionInput) {
  const { appointment, product, warehouseId, quantity } = input;
  const kind = input.kind ?? "APPOINTMENT";
  const consumption = await db.consumption.create({
    data: {
      appointmentId: appointment.id,
      specialistId: appointment.specialistId,
      productId: product.id,
      warehouseId,
      quantity: new Prisma.Decimal(quantity),
      unit: product.unit,
      kind,
      createdById: input.actorId,
      note: input.note || null,
    },
  });

  if (warehouseId) {
    await db.stock.upsert({
      where: { productId_warehouseId: { productId: product.id, warehouseId } },
      update: { quantity: { decrement: new Prisma.Decimal(quantity) } },
      create: {
        productId: product.id,
        warehouseId,
        quantity: new Prisma.Decimal(0).minus(quantity),
      },
    });
    const lotAllocations = await applyLotChange(db, product.id, warehouseId, quantity);
    if (lotAllocations.length > 0) {
      await db.consumption.update({ where: { id: consumption.id }, data: { lotAllocations } });
    }
  }

  await logAudit({
    tx: "$transaction" in db ? undefined : db,
    actorId: input.actorId,
    action: "CREATE",
    entity: "Consumption",
    entityId: consumption.id,
    summary: `Zużycie preparatu „${product.name}": ${quantity} ${product.unit} (wizyta pacjenta ${appointment.patient.name})`,
    data: {
      appointmentId: appointment.id,
      productId: product.id,
      warehouseId,
      quantity,
      unit: product.unit,
      kind,
      note: input.note || null,
    },
  });

  return consumption;
}
