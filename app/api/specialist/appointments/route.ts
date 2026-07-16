import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole, requireStrictRole } from "@/lib/api-helpers";

const CreateAppointmentSchema = z
  .object({
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    phone: z.string().trim().min(3).max(40),
    email: z.string().trim().email().max(200).optional(),
    serviceId: z.string().trim().min(1).nullable(),
    customServiceName: z.string().trim().max(200).nullable().optional(),
    startsAt: z.string().min(1),
    preparations: z
      .array(
        z.object({
          productId: z.string().min(1),
          quantity: z.number().positive().max(100000),
        }),
      )
      .max(10)
      .default([]),
  })
  .superRefine((value, ctx) => {
    if (!value.serviceId && (!value.customServiceName || value.customServiceName.length < 2)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["customServiceName"],
        message: "Podaj nazwę niestandardowego zabiegu",
      });
    }
  });

function normalizePhone(value: string) {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return trimmed;
  return trimmed.startsWith("+") ? `+${digits}` : digits;
}

export async function GET(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;

  // Admin może podejrzeć panel konkretnego specjalisty.
  const deny = requireRole(user!.role, ["SPECIALIST", "RECEPTION", "ADMIN"]);
  if (deny) return deny;

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const specialistIdParam = url.searchParams.get("specialistId");

  const fromDt = from ? new Date(from) : new Date(Date.now() - 1000 * 60 * 60 * 24 * 7);
  const toDt = to ? new Date(to) : new Date(Date.now() + 1000 * 60 * 60 * 24 * 14);
  const specialistId = user!.role === "ADMIN" && specialistIdParam ? specialistIdParam : user!.id;

  const [appointments, services, products] = await Promise.all([
    prisma.appointment.findMany({
      where: { specialistId, startsAt: { gte: fromDt, lt: toDt } },
      orderBy: { startsAt: "asc" },
      include: { patient: true, service: true },
      take: 500,
    }),
    prisma.service.findMany({
      where: { specialistAssignments: { some: { specialistId } } },
      orderBy: [{ category: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        category: true,
        durationMin: true,
        suggestedProducts: {
          select: {
            productId: true,
            quantity: true,
            unit: true,
            product: { select: { name: true, unit: true } },
          },
        },
      },
    }),
    prisma.product.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, unit: true },
    }),
  ]);

  const shapedServices = services.map((s) => ({
    id: s.id,
    name: s.name,
    category: s.category,
    durationMin: s.durationMin,
    suggestedProducts: s.suggestedProducts.map((sp) => ({
      productId: sp.productId,
      productName: sp.product.name,
      quantity: Number(sp.quantity),
      unit: sp.product.unit,
    })),
  }));

  return NextResponse.json({ ok: true, appointments, services: shapedServices, products });
}

export async function POST(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["SPECIALIST", "RECEPTION"]);
  if (deny) return deny;

  const json = await req.json().catch(() => null);
  const parsed = CreateAppointmentSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: parsed.error.issues[0]?.message ?? "Niepoprawne dane" },
      { status: 400 },
    );
  }

  const startsAt = new Date(parsed.data.startsAt);
  if (Number.isNaN(startsAt.getTime())) {
    return NextResponse.json({ ok: false, message: "Niepoprawna godzina rozpoczęcia" }, { status: 400 });
  }

  const isCustom = !parsed.data.serviceId;
  const requestedService = parsed.data.serviceId
    ? await prisma.service.findFirst({
        where: {
          id: parsed.data.serviceId,
          specialistAssignments: { some: { specialistId: user!.id } },
        },
        select: {
          id: true,
          durationMin: true,
          priceSuggested: true,
          suggestedProducts: { select: { productId: true, quantity: true } },
        },
      })
    : null;

  const suggestedByProduct = new Map<string, number>(
    (requestedService?.suggestedProducts ?? []).map((sp) => [sp.productId, Number(sp.quantity)]),
  );

  if (!isCustom && !requestedService) {
    return NextResponse.json(
      { ok: false, message: "Ten zabieg nie jest przypisany do Twojego konta" },
      { status: 403 },
    );
  }

  const productIds = Array.from(new Set(parsed.data.preparations.map((item) => item.productId)));
  const products = productIds.length
    ? await prisma.product.findMany({
        where: { id: { in: productIds }, isActive: true },
        select: { id: true, unit: true },
      })
    : [];
  if (products.length !== productIds.length) {
    return NextResponse.json({ ok: false, message: "Nie znaleziono jednego z preparatów" }, { status: 400 });
  }
  const productUnitById = new Map(products.map((product) => [product.id, product.unit]));

  const patientName = `${parsed.data.firstName} ${parsed.data.lastName}`.replace(/\s+/g, " ").trim();
  const phone = normalizePhone(parsed.data.phone);
  const email = parsed.data.email?.trim() || null;
  const durationMin = requestedService?.durationMin ?? 30;
  const endsAt = new Date(startsAt.getTime() + durationMin * 60 * 1000);

  const appointment = await prisma.$transaction(async (tx) => {
    const service = isCustom
      ? await tx.service.upsert({
          where: { id: "service-custom" },
          update: {},
          create: {
            id: "service-custom",
            name: "Niestandardowe",
            category: "Niestandardowe",
            description: "Techniczna usługa dla nazw wpisywanych ręcznie przez pracownika.",
            durationMin: 30,
          },
          select: { id: true },
        })
      : requestedService!;

    const existingPatient = await tx.patient.findFirst({
      where: { phone },
      orderBy: { updatedAt: "desc" },
      select: { id: true, email: true },
    });
    let patient: { id: string };
    if (existingPatient) {
      patient = existingPatient;
      if (email && !existingPatient.email) {
        await tx.patient.update({ where: { id: existingPatient.id }, data: { email } });
      }
    } else {
      patient = await tx.patient.create({
        data: { name: patientName, phone, email },
        select: { id: true },
      });
    }

    const created = await tx.appointment.create({
      data: {
        patientId: patient.id,
        specialistId: user!.id,
        // Wizyty wpisywane przez lekarza wymagają akceptacji recepcji/admina
        approvalStatus: user!.role === "SPECIALIST" ? "PENDING" : "APPROVED",
        serviceId: service.id,
        customServiceName: isCustom ? parsed.data.customServiceName!.trim() : null,
        startsAt,
        endsAt,
        priceEstimate: requestedService?.priceSuggested ?? null,
      },
      select: { id: true },
    });

    const treatmentWarehouse = await tx.warehouse.findUnique({
      where: { id: "treatment-warehouse" },
      select: { id: true },
    });

    for (const preparation of parsed.data.preparations) {
      const quantity = new Prisma.Decimal(preparation.quantity);
      const suggested = suggestedByProduct.get(preparation.productId);
      const deviatesFromSuggested = suggested !== undefined && suggested !== preparation.quantity;

      await tx.consumption.create({
        data: {
          appointmentId: created.id,
          specialistId: user!.id,
          productId: preparation.productId,
          warehouseId: treatmentWarehouse?.id ?? null,
          quantity,
          unit: productUnitById.get(preparation.productId)!,
          kind: "APPOINTMENT",
          createdById: user!.id,
          status: deviatesFromSuggested ? "PENDING" : "APPLIED",
          suggestedQuantity: suggested !== undefined ? new Prisma.Decimal(suggested) : null,
          note: deviatesFromSuggested
            ? "Ilość zmieniona przez specjalistę względem sugerowanej — oczekuje na akceptację administratora."
            : null,
        },
      });

      // Stan magazynowy jest odejmowany od razu tylko dla zużyć zgodnych z sugestią.
      // Zmienione ilości czekają na akceptację administratora (patrz: /api/admin/consumption-adjustments).
      if (treatmentWarehouse && !deviatesFromSuggested) {
        await tx.stock.upsert({
          where: {
            productId_warehouseId: {
              productId: preparation.productId,
              warehouseId: treatmentWarehouse.id,
            },
          },
          update: { quantity: { decrement: quantity } },
          create: {
            productId: preparation.productId,
            warehouseId: treatmentWarehouse.id,
            quantity: new Prisma.Decimal(0).minus(quantity),
          },
        });
      }
    }

    return created;
  });

  return NextResponse.json({ ok: true, appointment });
}
