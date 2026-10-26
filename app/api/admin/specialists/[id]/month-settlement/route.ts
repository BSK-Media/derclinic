import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole, scopedLocationWhere } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { formatPLNFromGrosze } from "@/lib/money";
import { effectivePercent, loadPercentOverrides } from "@/lib/payout-percent";
import { isMonthKey, warsawMonthRange } from "@/lib/specialist-overrides";

export const dynamic = "force-dynamic";

// Rozliczenie niestandardowe specjalisty za miesiąc — tylko administrator. Zwraca wartości standardowe (policzone z wizyt)
// i zapisane nadpisanie, żeby można je było porównać i poprawić.
async function standardFigures(specialistId: string, month: string, scope: { locationId?: string }) {
  const { start, end } = warsawMonthRange(month);
  const specialist = await prisma.user.findUnique({ where: { id: specialistId }, select: { payoutPercent: true } });
  const percent = specialist?.payoutPercent ?? 0;
  const overrides = (await loadPercentOverrides([specialistId])).get(specialistId);
  const appointments = await prisma.appointment.findMany({
    where: {
      specialistId,
      status: "COMPLETED",
      approvalStatus: "APPROVED",
      deletedAt: null,
      startsAt: { gte: start, lt: end },
      ...scope,
    },
    select: {
      serviceId: true,
      priceFinal: true,
      priceEstimate: true,
      consumptions: { select: { quantity: true, product: { select: { purchasePrice: true } } } },
    },
    take: 10000,
  });
  let revenue = 0;
  let materialCost = 0;
  let payout = 0;
  for (const a of appointments) {
    const material = a.consumptions.reduce((sum, c) => sum + Math.round((c.product.purchasePrice ?? 0) * Math.abs(Number(c.quantity))), 0);
    const price = a.priceFinal ?? a.priceEstimate ?? 0;
    revenue += price;
    materialCost += material;
    payout += Math.round(((price - material) * effectivePercent(percent, overrides, a.serviceId)) / 100);
  }
  return { appointments: appointments.length, revenue, materialCost, payout };
}

export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const month = new URL(req.url).searchParams.get("month") ?? "";
  if (!isMonthKey(month)) return NextResponse.json({ ok: false, message: "Podaj miesiąc (RRRR-MM)" }, { status: 400 });

  const specialist = await prisma.user.findFirst({ where: { id: params.id, ...scopedLocationWhere(user!) }, select: { id: true, name: true } });
  if (!specialist) return NextResponse.json({ ok: false, message: "Nie znaleziono pracownika" }, { status: 404 });

  const [standard, override] = await Promise.all([
    standardFigures(specialist.id, month, scopedLocationWhere(user!)),
    prisma.specialistMonthSettlement.findUnique({
      where: { specialistId_month: { specialistId: specialist.id, month } },
      include: { updatedBy: { select: { name: true } } },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    month,
    standard,
    override: override
      ? {
          appointments: override.appointments,
          revenue: override.revenue,
          materialCost: override.materialCost,
          payout: override.payout,
          note: override.note,
          updatedAt: override.updatedAt.toISOString(),
          updatedBy: override.updatedBy?.name ?? null,
        }
      : null,
  });
}

const nullableGrosze = z.number().int().min(0).max(1_000_000_000).nullable();
const PutSchema = z.object({
  month: z.string(),
  appointments: z.number().int().min(0).max(100000).nullable(),
  revenue: nullableGrosze,
  materialCost: nullableGrosze,
  payout: nullableGrosze,
  note: z.string().trim().max(500).nullable().optional(),
});

// Zapis nadpisania. Gdy wszystkie pola są puste, nadpisanie jest usuwane (wracają wartości standardowe).
export async function PUT(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const parsed = PutSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !isMonthKey(parsed.data.month)) {
    return NextResponse.json({ ok: false, message: "Niepoprawne dane" }, { status: 400 });
  }
  const d = parsed.data;
  const specialist = await prisma.user.findFirst({ where: { id: params.id, ...scopedLocationWhere(user!) }, select: { id: true, name: true } });
  if (!specialist) return NextResponse.json({ ok: false, message: "Nie znaleziono pracownika" }, { status: 404 });

  const before = await prisma.specialistMonthSettlement.findUnique({ where: { specialistId_month: { specialistId: specialist.id, month: d.month } } });
  const empty = d.appointments === null && d.revenue === null && d.materialCost === null && d.payout === null;

  if (empty) {
    if (before) await prisma.specialistMonthSettlement.delete({ where: { id: before.id } });
  } else {
    await prisma.specialistMonthSettlement.upsert({
      where: { specialistId_month: { specialistId: specialist.id, month: d.month } },
      create: {
        specialistId: specialist.id,
        month: d.month,
        appointments: d.appointments,
        revenue: d.revenue,
        materialCost: d.materialCost,
        payout: d.payout,
        note: d.note || null,
        updatedById: user!.id,
      },
      update: {
        appointments: d.appointments,
        revenue: d.revenue,
        materialCost: d.materialCost,
        payout: d.payout,
        note: d.note || null,
        updatedById: user!.id,
      },
    });
  }

  const fmt = (v: number | null) => (v === null ? "standardowo" : formatPLNFromGrosze(v));
  await logAudit({
    actorId: user!.id,
    action: empty ? "DELETE" : "UPDATE",
    entity: "SpecialistMonthSettlement",
    entityId: specialist.id,
    summary: empty
      ? `Usunięto rozliczenie niestandardowe ${specialist.name} za ${d.month} (wrócono do wartości standardowych)`
      : `Rozliczenie niestandardowe ${specialist.name} za ${d.month}: zabiegi ${d.appointments ?? "standardowo"}, przychód ${fmt(d.revenue)}, koszt ${fmt(d.materialCost)}, wynagrodzenie ${fmt(d.payout)}`,
    data: {
      month: d.month,
      before: before ? { appointments: before.appointments, revenue: before.revenue, materialCost: before.materialCost, payout: before.payout, note: before.note } : null,
      after: empty ? null : { appointments: d.appointments, revenue: d.revenue, materialCost: d.materialCost, payout: d.payout, note: d.note ?? null },
    },
  });

  return NextResponse.json({ ok: true, removed: empty });
}
