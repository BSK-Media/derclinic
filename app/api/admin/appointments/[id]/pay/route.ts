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
      payments: { select: { amount: true } },
    },
  });
  if (!appointment || appointment.deletedAt) {
    return NextResponse.json({ ok: false, message: "Nie znaleziono wizyty" }, { status: 404 });
  }

  const total = appointment.priceFinal ?? appointment.service?.price ?? appointment.priceEstimate ?? 0;
  const paid = appointment.payments.reduce((sum, payment) => sum + payment.amount, 0);
  const remaining = Math.max(0, total - paid);
  if (remaining <= 0) {
    return NextResponse.json({ ok: false, message: "Wizyta jest już opłacona" }, { status: 400 });
  }
  if (parsed.data.amount > remaining) {
    return NextResponse.json(
      { ok: false, message: "Kwota przekracza pozostałą należność" },
      { status: 400 },
    );
  }

  const p = await prisma.payment.create({
    data: {
      appointmentId: params.id,
      method: parsed.data.method as any,
      amount: parsed.data.amount,
    },
  });

  await logAudit({
    actorId: user!.id,
    action: "CREATE",
    entity: "Payment",
    entityId: p.id,
    data: { appointmentId: params.id },
  });

  return NextResponse.json({ ok: true, payment: p });
}
