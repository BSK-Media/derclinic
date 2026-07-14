import { NextResponse } from "next/server";
import { Prisma, UnitType } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole, requireStrictRole } from "@/lib/api-helpers";

const UnitSchema = z.enum(["UNIT", "ML", "MG", "G", "AMPULE", "BOTOX_UNIT"]);

const CreateAppointmentSchema = z
  .object({
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    phone: z.string().trim().min(3).max(40),
    serviceId: z.string().trim().min(1).nullable(),
    customServiceName: z.string().trim().max(200).nullable().optional(),
    startsAt: z.string().min(1),
    preparations: z
      .array(
        z.object({
          productId: z.string().min(1),
          quantity: z.number().positive().max(100000),
          unit: UnitSchema,
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
      },
    }),
    prisma.product.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, unit: true },
    }),
  ]);

  return NextResponse.json({ ok: true, appointments, services, products });
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
        select: { id: true, durationMin: true, priceSuggested: true },
      })
    : null;

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
        select: { id: true },
      })
    : [];
  if (products.length !== productIds.length) {
    return NextResponse.json({ ok: false, message: "Nie znaleziono jednego z preparatów" }, { status: 400 });
  }

  const patientName = `${parsed.data.firstName} ${parsed.data.lastName}`.replace(/\s+/g, " ").trim();
  const phone = normalizePhone(parsed.data.phone);
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

    let patient = await tx.patient.findFirst({
      where: { phone },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    });
    if (!patient) {
      patient = await tx.patient.create({
        data: { name: patientName, phone },
        select: { id: true },
      });
    }

    const created = await tx.appointment.create({
      data: {
        patientId: patient.id,
        specialistId: user!.id,
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
      await tx.consumption.create({
        data: {
          appointmentId: created.id,
          specialistId: user!.id,
          productId: preparation.productId,
          warehouseId: treatmentWarehouse?.id ?? null,
          quantity,
          unit: preparation.unit as UnitType,
          kind: "APPOINTMENT",
          createdById: user!.id,
        },
      });

      if (treatmentWarehouse) {
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
