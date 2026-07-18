import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";

const BodySchema = z.object({
  method: z.enum(["CASH", "CARD", "VOUCHER"]),
  amount: z.number().int().min(1),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN", "RECEPTION"]);
  if (deny) return deny;

  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success)
    return NextResponse.json({ ok: false, message: "Niepoprawne dane" }, { status: 400 });

  const appointment = await prisma.appointment.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      deletedAt: true,
      priceFinal: true,
      priceEstimate: true,
      service: { select: { price: true } },
      payments: { select: { amount: true, method: true } },
    },
  });
  if (!appointment || appointment.deletedAt) {
    return NextResponse.json({ ok: false, message: "Nie znaleziono wizyty" }, { status: 404 });
  }

  const total = appointment.priceFinal ?? appointment.service?.price ?? appointment.priceEstimate ?? 0;
  const paymentsWithOtherMethods = appointment.payments.filter(
    (payment) => payment.method !== parsed.data.method,
  );
  const paidWithOtherMethods = paymentsWithOtherMethods.reduce(
    (sum, payment) => sum + payment.amount,
    0,
  );
  const availableForMethod = Math.max(0, total - paidWithOtherMethods);
  if (availableForMethod <= 0) {
    return NextResponse.json(
      { ok: false, message: "Cała należność została już rozliczona inną metodą" },
      { status: 400 },
    );
  }
  if (parsed.data.amount > availableForMethod) {
    return NextResponse.json(
      { ok: false, message: "Kwota przekracza należność dostępną dla tej metody" },
      { status: 400 },
    );
  }

  const replaced = appointment.payments.some(
    (payment) => payment.method === parsed.data.method,
  );
  const p = await prisma.$transaction(async (tx) => {
    await tx.payment.deleteMany({
      where: {
        appointmentId: params.id,
        method: parsed.data.method as any,
      },
    });

    return tx.payment.create({
      data: {
        appointmentId: params.id,
        method: parsed.data.method as any,
        amount: parsed.data.amount,
      },
    });
  });

  await logAudit({
    actorId: user!.id,
    action: "CREATE",
    entity: "Payment",
    entityId: p.id,
    data: { appointmentId: params.id, replaced },
  });

  return NextResponse.json({ ok: true, payment: p, replaced });
}
