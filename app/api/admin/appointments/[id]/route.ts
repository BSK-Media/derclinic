import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole, requireStrictRole } from "@/lib/api-helpers";
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
      consumptions: {
        include: {
          product: true,
          warehouse: true,
          createdBy: { select: { name: true, login: true } },
        },
      },
      payments: true,
    },
  });

  if (!appt || appt.deletedAt) {
    return NextResponse.json({ ok: false, message: "Nie znaleziono" }, { status: 404 });
  }

  const [products, warehouses, services, specialistAssignments] = await Promise.all([
    prisma.product.findMany({ orderBy: { name: "asc" } }),
    prisma.warehouse.findMany({ orderBy: { name: "asc" } }),
    prisma.service.findMany({ orderBy: { name: "asc" } }),
    appt.specialistId
      ? prisma.specialistService.findMany({
          where: { specialistId: appt.specialistId },
          select: { serviceId: true },
        })
      : Promise.resolve([] as { serviceId: string }[]),
  ]);

  return NextResponse.json({
    ok: true,
    appointment: appt,
    products,
    warehouses,
    services,
    specialistServiceIds: specialistAssignments.map((a: { serviceId: string }) => a.serviceId),
    viewerRole: user!.role,
  });
}

const PatchSchema = z.object({
  status: z.enum(["SCHEDULED", "COMPLETED", "CANCELED", "NO_SHOW"]).optional(),
  priceFinal: z.number().int().optional().nullable(),
  priceEstimate: z.number().int().optional().nullable(),
  note: z.string().optional().or(z.literal("")),
  startsAt: z.string().datetime({ offset: true }).optional(),
  endsAt: z.string().datetime({ offset: true }).optional(),
  // Zmiana usługi — dozwolona tylko dla wizyt o statusie Zaplanowana
  serviceId: z.string().min(1).optional(),
});

const DeleteSchema = z.object({
  reason: z.string().trim().min(3, "Podaj powód usunięcia wizyty").max(500),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN", "RECEPTION"]);
  if (deny) return deny;

  const json = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(json);
  if (!parsed.success)
    return NextResponse.json({ ok: false, message: "Niepoprawne dane" }, { status: 400 });

  const existing = await prisma.appointment.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      specialistId: true,
      serviceId: true,
      startsAt: true,
      status: true,
      deletedAt: true,
    },
  });
  if (!existing || existing.deletedAt)
    return NextResponse.json({ ok: false, message: "Nie znaleziono" }, { status: 404 });

  // Zmiana usługi — tylko gdy wizyta ma status Zaplanowana
  let serviceChange: { serviceId: string; price: number | null } | null = null;
  if (parsed.data.serviceId !== undefined && parsed.data.serviceId !== existing.serviceId) {
    if (existing.status !== "SCHEDULED") {
      return NextResponse.json(
        { ok: false, message: "Usługę można zmienić tylko dla wizyty o statusie Zaplanowana." },
        { status: 400 },
      );
    }
    const newService = await prisma.service.findUnique({
      where: { id: parsed.data.serviceId },
      select: { id: true, price: true },
    });
    if (!newService) {
      return NextResponse.json(
        { ok: false, message: "Nie znaleziono wybranej usługi" },
        { status: 400 },
      );
    }
    serviceChange = { serviceId: newService.id, price: newService.price };
  }

  const newStarts = parsed.data.startsAt ? new Date(parsed.data.startsAt) : undefined;
  const newEnds = parsed.data.endsAt ? new Date(parsed.data.endsAt) : undefined;
  if (newStarts && newEnds && newEnds <= newStarts) {
    return NextResponse.json(
      { ok: false, message: "Koniec wizyty musi być po jej rozpoczęciu." },
      { status: 400 },
    );
  }

  const now = new Date();
  const finalStartsAt = newStarts ?? existing.startsAt;
  if (
    parsed.data.status === "SCHEDULED" &&
    (existing.startsAt.getTime() <= now.getTime() || finalStartsAt.getTime() <= now.getTime())
  ) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "Minęła godzina rozpoczęcia wizyty. Wybierz status: Zakończona, Odwołana albo Nieobecność pacjenta.",
      },
      { status: 400 },
    );
  }

  const appt = await prisma.appointment.update({
    where: { id: params.id },
    data: {
      status: parsed.data.status as any,
      ...(parsed.data.status !== undefined && parsed.data.status !== existing.status
        ? {
            approvalStatus: "PENDING" as const,
            approvedAt: null,
            approvedById: null,
            rejectionReason: null,
          }
        : {}),
      priceFinal: parsed.data.priceFinal === undefined ? undefined : parsed.data.priceFinal,
      priceEstimate:
        user!.role !== "ADMIN" || parsed.data.priceEstimate === undefined
          ? undefined
          : parsed.data.priceEstimate,
      note: parsed.data.note === undefined ? undefined : parsed.data.note ? parsed.data.note : null,
      startsAt: newStarts,
      endsAt: newEnds,
      // Przy zmianie usługi aktualizujemy też cenę standardową (orientacyjną)
      // i czyścimy ewentualną niestandardową nazwę usługi.
      ...(serviceChange
        ? {
            serviceId: serviceChange.serviceId,
            customServiceName: null,
            priceEstimate: serviceChange.price,
          }
        : {}),
    },
  });

  await logAudit({
    actorId: user!.id,
    action: "UPDATE",
    entity: "Appointment",
    entityId: appt.id,
    data: parsed.data,
  });

  return NextResponse.json({ ok: true, appointment: appt });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN", "RECEPTION"]);
  if (deny) return deny;

  const json = await req.json().catch(() => null);
  const parsed = DeleteSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: parsed.error.issues[0]?.message ?? "Podaj powód usunięcia wizyty" },
      { status: 400 },
    );
  }

  const existing = await prisma.appointment.findUnique({
    where: { id: params.id },
    select: { id: true, deletedAt: true },
  });
  if (!existing) {
    return NextResponse.json({ ok: false, message: "Nie znaleziono wizyty" }, { status: 404 });
  }
  if (existing.deletedAt) {
    return NextResponse.json(
      { ok: false, message: "Ta wizyta znajduje się już w usuniętych" },
      { status: 409 },
    );
  }

  const deletedAt = new Date();
  const appointment = await prisma.appointment.update({
    where: { id: params.id },
    data: {
      deletedAt,
      deletedById: user!.id,
      deletionReason: parsed.data.reason,
    },
  });

  await logAudit({
    actorId: user!.id,
    action: "DELETE",
    entity: "Appointment",
    entityId: appointment.id,
    data: {
      softDelete: true,
      deletedAt,
      deletionReason: parsed.data.reason,
    },
  });

  return NextResponse.json({ ok: true, appointment });
}
