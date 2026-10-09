import { canAccessSpecialistAppointment, isAdminLike } from "@/lib/roles";
import { logRecordAccess } from "@/lib/access-log";
import { recordNoteVersion } from "@/lib/note-versions";
import { suggestLotsByProduct } from "@/lib/lot-allocation";
import { NextResponse, after } from "next/server";
import {
  appBaseUrl,
  notifyAppointmentCanceled,
  notifyAppointmentChanged,
} from "@/lib/email-notifications";
import { PATIENT_PUBLIC_SELECT } from "@/lib/patient-select";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole, requireStrictRole } from "@/lib/api-helpers";
import { logAudit, diffFields, formatWarsaw } from "@/lib/audit";
import {
  APPOINTMENT_AUDIT_FIELDS,
  appointmentSnapshot,
  describeAppointmentChanges,
} from "@/lib/audit-appointment";

export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = await requireRole(user!.role, ["SPECIALIST", "RECEPTION", "ADMIN", "MANAGER"]);
  if (deny) return deny;

  const appt = await prisma.appointment.findFirst({
    where: user!.role === "ADMIN" ? { id: params.id } : { id: params.id, locationId: user!.locationId },
    include: {
      patient: { select: PATIENT_PUBLIC_SELECT },
      service: { include: { suggestedProducts: { include: { product: true } } } },
      consumptions: { include: { product: true, warehouse: true } },
      payments: true,
    },
  });
  if (!appt || appt.deletedAt) {
    return NextResponse.json({ ok: false, message: "Nie znaleziono" }, { status: 404 });
  }

  if (!canAccessSpecialistAppointment(user!, { ...appt, locationId: user!.role === "ADMIN" ? appt.locationId : user!.locationId })) {
    return NextResponse.json({ ok: false, message: "Brak uprawnień" }, { status: 403 });
  }

  await logRecordAccess({
    actorId: user!.id,
    entity: "Appointment",
    entityId: appt.id,
    summary: `Otwarcie karty wizyty (${appt.patient.name})`,
  });

  const lotSuggestions = await suggestLotsByProduct(
    prisma,
    (appt.service?.suggestedProducts ?? []).map((sp) => sp.productId),
    appt.locationId,
  );
  const apptWithLots = {
    ...appt,
    service: appt.service
      ? {
          ...appt.service,
          suggestedProducts: appt.service.suggestedProducts.map((sp) => ({
            ...sp,
            lots: lotSuggestions.get(sp.productId) ?? [],
          })),
        }
      : appt.service,
  };

  return NextResponse.json({ ok: true, appointment: apptWithLots });
}

const PatchSchema = z
  .object({
    status: z.enum(["SCHEDULED", "COMPLETED", "CANCELED", "NO_SHOW"]).optional(),
    note: z.string().optional().or(z.literal("")),
    startsAt: z.string().datetime({ offset: true }).optional(),
    endsAt: z.string().datetime({ offset: true }).optional(),
  })
  .strict();

export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["SPECIALIST", "ADMIN", "MANAGER"]);
  if (deny) return deny;

  const json = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(json);
  if (!parsed.success)
    return NextResponse.json({ ok: false, message: "Niepoprawne dane" }, { status: 400 });

  const existing = await prisma.appointment.findFirst({
    where: user!.role === "ADMIN" ? { id: params.id } : { id: params.id, locationId: user!.locationId },
    select: {
      id: true,
      specialistId: true,
      serviceId: true,
      startsAt: true,
      endsAt: true,
      status: true,
      priceFinal: true,
      priceEstimate: true,
      note: true,
      deletedAt: true,
      patient: { select: { name: true } },
      service: { select: { name: true } },
    },
  });
  if (!existing || existing.deletedAt)
    return NextResponse.json({ ok: false, message: "Nie znaleziono" }, { status: 404 });
  if (!canAccessSpecialistAppointment(user!, { ...existing, locationId: user!.locationId })) {
    return NextResponse.json({ ok: false, message: "Brak uprawnień" }, { status: 403 });
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
      note: parsed.data.note === undefined ? undefined : parsed.data.note ? parsed.data.note : null,
      startsAt: newStarts,
      endsAt: newEnds,
    },
  });

  if (parsed.data.note !== undefined) {
    await recordNoteVersion(prisma, "APPOINTMENT", appt.id, existing.note, parsed.data.note || null, user!.id);
  }

  const changes = diffFields(
    appointmentSnapshot(existing),
    appointmentSnapshot(appt),
    APPOINTMENT_AUDIT_FIELDS,
  );
  await logAudit({
    actorId: user!.id,
    action: "UPDATE",
    entity: "Appointment",
    entityId: appt.id,
    summary: `${changes?.status ? "Zmiana statusu wizyty" : "Zmiana wizyty"} ${existing.patient.name} · ${existing.service.name} (${formatWarsaw(existing.startsAt)}): ${describeAppointmentChanges(changes)}`,
    data: {
      ...parsed.data,
      patient: existing.patient.name,
      changes,
      approvalReset: changes?.status ? true : undefined,
    },
  });

  // E-mail do klienta: odwołanie albo zmiana terminu (po odpowiedzi).
  const baseUrl = appBaseUrl(req);
  if (appt.status === "CANCELED" && existing.status !== "CANCELED") {
    after(() => notifyAppointmentCanceled(appt.id, { baseUrl }));
  } else if (appt.startsAt.getTime() !== existing.startsAt.getTime()) {
    after(() => notifyAppointmentChanged(appt.id, { previousStartsAt: existing.startsAt, baseUrl }));
  }

  return NextResponse.json({ ok: true, appointment: appt });
}
