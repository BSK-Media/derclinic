import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole, scopedLocationWhere } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { AUDIT_PAYMENT_METHOD_LABELS } from "@/lib/audit-labels";
import { formatPLNFromGrosze } from "@/lib/money";
import { appointmentDue, loadDayGroup } from "@/lib/day-group";

export const dynamic = "force-dynamic";

// Wizyty tego samego pacjenta z tego samego dnia — do wspólnego rozliczenia.
export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN", "MANAGER", "RECEPTION"]);
  if (deny) return deny;

  const group = await loadDayGroup(params.id, scopedLocationWhere(user!));
  if (!group) return NextResponse.json({ ok: false, message: "Nie znaleziono wizyty" }, { status: 404 });

  return NextResponse.json({
    ok: true,
    visits: group.map((a) => {
      const due = appointmentDue(a);
      const paid = a.payments.reduce((sum, p) => sum + p.amount, 0);
      return {
        id: a.id,
        startsAt: a.startsAt.toISOString(),
        endsAt: a.endsAt.toISOString(),
        status: a.status,
        approvalStatus: a.approvalStatus,
        serviceName: a.customServiceName || a.service.name,
        specialistName: a.specialist.name,
        due,
        paid,
        remaining: Math.max(0, due - paid),
        hasPriceFinal: a.priceFinal !== null,
      };
    }),
  });
}

const PaySchema = z.object({
  method: z.enum(["CASH", "CARD", "TRANSFER"]),
  // Cena końcowa wizyty w groszach — opcjonalna korekta przed płatnością (np. dwie okolice zamiast jednej).
  items: z
    .array(z.object({ appointmentId: z.string().min(1).max(100), priceFinal: z.number().int().min(0).max(100_000_00).optional() }))
    .min(1)
    .max(20),
});

// Jedna płatność za wszystkie wskazane wizyty: dla każdej wizyty zapisujemy płatność wybraną metodą na kwotę
// pozostałą do zapłaty (po ewentualnej korekcie ceny). Każda wizyta zachowuje własną płatność, więc rozliczenia,
// analityka i wypłaty specjalistów działają jak dotąd.
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN", "MANAGER", "RECEPTION"]);
  if (deny) return deny;

  const parsed = PaySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, message: "Niepoprawne dane" }, { status: 400 });

  const group = await loadDayGroup(params.id, scopedLocationWhere(user!));
  if (!group) return NextResponse.json({ ok: false, message: "Nie znaleziono wizyty" }, { status: 404 });
  const byId = new Map(group.map((a) => [a.id, a]));
  const items = parsed.data.items;
  if (new Set(items.map((i) => i.appointmentId)).size !== items.length || items.some((i) => !byId.has(i.appointmentId))) {
    return NextResponse.json({ ok: false, message: "Wizyty muszą należeć do tego pacjenta i tego dnia" }, { status: 400 });
  }
  const method = parsed.data.method;

  type Plan = { id: string; priceChange: number | null; amount: number; replaced: boolean; before: number | null };
  const plans: Plan[] = [];
  for (const item of items) {
    const appt = byId.get(item.appointmentId)!;
    const newPrice = item.priceFinal;
    const effective = {
      priceFinal: newPrice ?? appt.priceFinal,
      priceEstimate: appt.priceEstimate,
      service: appt.service,
    };
    const due = appointmentDue(effective);
    const paidOther = appt.payments.filter((p) => p.method !== method).reduce((sum, p) => sum + p.amount, 0);
    const amount = Math.max(0, due - paidOther);
    const existingSame = appt.payments.find((p) => p.method === method);
    plans.push({
      id: appt.id,
      priceChange: newPrice !== undefined && newPrice !== appt.priceFinal ? newPrice : null,
      amount,
      replaced: Boolean(existingSame),
      before: existingSame?.amount ?? null,
    });
  }

  await prisma.$transaction(async (tx) => {
    for (const plan of plans) {
      if (plan.priceChange !== null) {
        await tx.appointment.update({ where: { id: plan.id }, data: { priceFinal: plan.priceChange } });
      }
      await tx.payment.deleteMany({ where: { appointmentId: plan.id, method } });
      if (plan.amount > 0) {
        await tx.payment.create({ data: { appointmentId: plan.id, method, amount: plan.amount } });
      }
    }
  });

  const total = plans.reduce((sum, plan) => sum + plan.amount, 0);
  await logAudit({
    actorId: user!.id,
    action: "CREATE",
    entity: "Payment",
    entityId: params.id,
    summary: `Wspólna płatność (${AUDIT_PAYMENT_METHOD_LABELS[method]}): ${formatPLNFromGrosze(total)} za ${plans.length} ${
      plans.length === 1 ? "wizytę" : "wizyty"
    } pacjenta tego samego dnia`,
    data: {
      method,
      total,
      visits: plans.map((p) => ({ appointmentId: p.id, amount: p.amount, priceChangedTo: p.priceChange, replacedAmount: p.before })),
    },
  });

  return NextResponse.json({ ok: true, total, visits: plans.length });
}
