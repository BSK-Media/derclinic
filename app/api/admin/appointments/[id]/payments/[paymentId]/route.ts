import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";

const PatchSchema = z.object({
  amount: z.number().int().min(1),
});

type RouteParams = { params: { id: string; paymentId: string } };

async function loadAppointmentWithPayment(appointmentId: string, paymentId: string, locationScopeId: string | null) {
  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, ...(locationScopeId ? { locationId: locationScopeId } : {}) },
    select: {
      id: true,
      deletedAt: true,
      priceFinal: true,
      priceEstimate: true,
      service: { select: { price: true } },
      payments: { select: { id: true, amount: true, method: true } },
    },
  });
  if (!appointment || appointment.deletedAt) return { appointment: null, payment: null };

  const payment = appointment.payments.find((p) => p.id === paymentId) ?? null;
  return { appointment, payment };
}

// Zmiana kwoty pojedynczej zapisanej płatności
export async function PATCH(req: Request, { params }: RouteParams) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN", "RECEPTION"]);
  if (deny) return deny;

  const json = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(json);
  if (!parsed.success)
    return NextResponse.json({ ok: false, message: "Niepoprawne dane" }, { status: 400 });

  const { appointment, payment } = await loadAppointmentWithPayment(params.id, params.paymentId, user!.locationScopeId);
  if (!appointment) {
    return NextResponse.json({ ok: false, message: "Nie znaleziono wizyty" }, { status: 404 });
  }
  if (!payment) {
    return NextResponse.json({ ok: false, message: "Nie znaleziono płatności" }, { status: 404 });
  }

  const total =
    appointment.priceFinal ?? appointment.service?.price ?? appointment.priceEstimate ?? 0;
  const paidWithOtherPayments = appointment.payments
    .filter((p) => p.id !== payment.id)
    .reduce((sum, p) => sum + p.amount, 0);
  const availableForThisPayment = Math.max(0, total - paidWithOtherPayments);
  if (parsed.data.amount > availableForThisPayment) {
    return NextResponse.json(
      { ok: false, message: "Kwota przekracza pozostałą należność dla tej płatności" },
      { status: 400 },
    );
  }

  const updated = await prisma.payment.update({
    where: { id: payment.id },
    data: { amount: parsed.data.amount },
  });

  await logAudit({
    actorId: user!.id,
    action: "UPDATE",
    entity: "Payment",
    entityId: payment.id,
    data: {
      appointmentId: params.id,
      previousAmount: payment.amount,
      newAmount: parsed.data.amount,
    },
  });

  return NextResponse.json({ ok: true, payment: updated });
}

// Usunięcie pojedynczej zapisanej płatności
export async function DELETE(_req: Request, { params }: RouteParams) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN", "RECEPTION"]);
  if (deny) return deny;

  const { appointment, payment } = await loadAppointmentWithPayment(params.id, params.paymentId, user!.locationScopeId);
  if (!appointment) {
    return NextResponse.json({ ok: false, message: "Nie znaleziono wizyty" }, { status: 404 });
  }
  if (!payment) {
    return NextResponse.json({ ok: false, message: "Nie znaleziono płatności" }, { status: 404 });
  }

  await prisma.payment.delete({ where: { id: payment.id } });

  await logAudit({
    actorId: user!.id,
    action: "DELETE",
    entity: "Payment",
    entityId: payment.id,
    data: {
      appointmentId: params.id,
      method: payment.method,
      amount: payment.amount,
    },
  });

  return NextResponse.json({ ok: true });
}
