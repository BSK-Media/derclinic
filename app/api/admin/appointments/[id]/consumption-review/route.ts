import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { recordAppointmentConsumption } from "@/lib/appointment-consumption";

// Potwierdzenie zużycia preparatów po zakończonej wizycie (okno na karcie wizyty):
// zapisuje użyte preparaty (zejście ze stanu) albo informację, że zabieg ich nie wymagał.
// Opcjonalnie zapisuje ilości jako standardowe zużycie zabiegu na przyszłość.

const ItemSchema = z.object({
  productId: z.string().min(1),
  warehouseId: z.string().min(1),
  quantity: z.number().finite().positive(),
});

const BodySchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("none") }),
  z.object({
    mode: z.literal("save"),
    items: z.array(ItemSchema).min(1).max(30),
    saveAsStandard: z.boolean().default(false),
  }),
]);

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN", "MANAGER", "RECEPTION"]);
  if (deny) return deny;

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("Niepoprawne dane zużycia");
  const body = parsed.data;

  const appointment = await prisma.appointment.findFirst({
    where: {
      id,
      deletedAt: null,
      ...(user!.locationScopeId ? { locationId: user!.locationScopeId } : {}),
    },
    select: {
      id: true,
      status: true,
      specialistId: true,
      locationId: true,
      serviceId: true,
      consumptionConfirmedAt: true,
      patient: { select: { name: true } },
      service: { select: { name: true } },
    },
  });
  if (!appointment) return bad("Nie znaleziono wizyty", 404);
  if (appointment.status !== "COMPLETED")
    return bad("Zużycie potwierdza się dla zakończonej wizyty");
  if (appointment.consumptionConfirmedAt)
    return bad("Zużycie dla tej wizyty zostało już potwierdzone", 409);

  // Ten sam preparat z tego samego magazynu wpisany kilka razy — sumujemy.
  const items =
    body.mode === "save"
      ? [
          ...body.items
            .reduce((map, item) => {
              const key = `${item.productId}|${item.warehouseId}`;
              const current = map.get(key);
              map.set(
                key,
                current ? { ...current, quantity: current.quantity + item.quantity } : { ...item },
              );
              return map;
            }, new Map<string, z.infer<typeof ItemSchema>>())
            .values(),
        ]
      : [];

  const productIds = [...new Set(items.map((item) => item.productId))];
  const warehouseIds = [...new Set(items.map((item) => item.warehouseId))];
  const [products, warehouses] = await Promise.all([
    prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, unit: true },
    }),
    prisma.warehouse.findMany({
      where: { id: { in: warehouseIds }, locationId: appointment.locationId },
      select: { id: true },
    }),
  ]);
  const productMap = new Map(products.map((product) => [product.id, product] as const));
  if (products.length !== productIds.length) return bad("Nie znaleziono jednego z preparatów", 404);
  if (warehouses.length !== warehouseIds.length)
    return bad("Magazyn nie należy do lokalizacji wizyty");

  const saveAsStandard =
    body.mode === "save" && body.saveAsStandard && Boolean(appointment.serviceId);

  try {
    await prisma.$transaction(async (tx) => {
      // Blokada przed podwójnym zapisem (dwa kliknięcia, dwie karty): tylko pierwszy przechodzi.
      const claimed = await tx.appointment.updateMany({
        where: { id: appointment.id, consumptionConfirmedAt: null },
        data: { consumptionConfirmedAt: new Date() },
      });
      if (claimed.count !== 1) throw new Error("Zużycie dla tej wizyty zostało już potwierdzone");

      for (const item of items) {
        await recordAppointmentConsumption(tx, {
          appointment,
          product: productMap.get(item.productId)!,
          warehouseId: item.warehouseId,
          quantity: item.quantity,
          actorId: user!.id,
        });
      }

      if (saveAsStandard) {
        for (const item of items) {
          const product = productMap.get(item.productId)!;
          await tx.serviceSuggestedProduct.upsert({
            where: {
              serviceId_productId: { serviceId: appointment.serviceId!, productId: product.id },
            },
            create: {
              serviceId: appointment.serviceId!,
              productId: product.id,
              quantity: new Prisma.Decimal(item.quantity),
              unit: product.unit,
            },
            update: { quantity: new Prisma.Decimal(item.quantity), unit: product.unit },
          });
        }
      }

      await logAudit({
        tx,
        actorId: user!.id,
        action: "UPDATE",
        entity: "Appointment",
        entityId: appointment.id,
        summary:
          body.mode === "none"
            ? `Potwierdzono brak zużycia preparatów (wizyta pacjenta ${appointment.patient.name})`
            : `Potwierdzono zużycie ${items.length} ${items.length === 1 ? "preparatu" : "preparatów"} (wizyta pacjenta ${appointment.patient.name})${
                saveAsStandard
                  ? ` — zapisane jako standard zabiegu „${appointment.service?.name ?? ""}"`
                  : " — jednorazowo"
              }`,
        data: {
          mode: body.mode,
          saveAsStandard,
          items: items.map((item) => ({ ...item, product: productMap.get(item.productId)!.name })),
        },
      });
    });
  } catch (e) {
    return bad(e instanceof Error ? e.message : "Nie udało się zapisać zużycia", 409);
  }

  return NextResponse.json({ ok: true, saveAsStandard });
}
