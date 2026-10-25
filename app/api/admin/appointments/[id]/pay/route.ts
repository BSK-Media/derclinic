import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole, scopedLocationWhere } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { AUDIT_PAYMENT_METHOD_LABELS } from "@/lib/audit-labels";
import { formatPLNFromGrosze } from "@/lib/money";
import { benefitStatus, packageSessionsLeft, voucherRemaining } from "@/lib/vouchers";

const BodySchema = z.object({
  method: z.enum(["CASH", "CARD", "TRANSFER", "BLIK", "VOUCHER", "PACKAGE"]),
  // Kwota w groszach: dla vouchera — pobierana z jego salda, dla pakietu — wartość pokrywana pakietem.
  amount: z.number().int().min(1),
  voucherId: z.string().min(1).max(100).optional(),
  patientPackageId: z.string().min(1).max(100).optional(),
  // Ile zabiegów z pakietu zużywa ta wizyta (domyślnie 1).
  packageSessions: z.number().int().min(1).max(50).optional(),
});

type PaymentRow = {
  id: string;
  amount: number;
  method: string;
  voucherId: string | null;
  patientPackageId: string | null;
  packageSessions: number | null;
};

// Zapis płatności za wizytę. Gotówka, karta i przelew: jedna płatność na metodę (nowa zastępuje starą). Voucher i pakiet:
// jedna płatność na konkretny voucher / pakiet; saldo vouchera i liczba zabiegów w pakiecie liczą się z tych płatności,
// więc usunięcie płatności zwraca środki lub zabieg.
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN", "MANAGER", "RECEPTION"]);
  if (deny) return deny;

  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, message: "Niepoprawne dane" }, { status: 400 });
  const { method, amount, voucherId, patientPackageId } = parsed.data;
  const packageSessions = parsed.data.packageSessions ?? 1;

  if (method === "VOUCHER" && !voucherId) return NextResponse.json({ ok: false, message: "Wybierz voucher" }, { status: 400 });
  if (method === "PACKAGE" && !patientPackageId) return NextResponse.json({ ok: false, message: "Wybierz pakiet" }, { status: 400 });

  const appointment = await prisma.appointment.findFirst({
    where: { id: params.id, ...scopedLocationWhere(user!) },
    select: {
      id: true,
      deletedAt: true,
      patientId: true,
      serviceId: true,
      patient: { select: { name: true } },
      priceFinal: true,
      priceEstimate: true,
      service: { select: { price: true } },
      payments: { select: { id: true, amount: true, method: true, voucherId: true, patientPackageId: true, packageSessions: true } },
    },
  });
  if (!appointment || appointment.deletedAt) {
    return NextResponse.json({ ok: false, message: "Nie znaleziono wizyty" }, { status: 404 });
  }

  // Ta sama „pozycja”: ta sama metoda, a dla vouchera i pakietu — ten sam voucher / pakiet.
  const sameKey = (p: PaymentRow) =>
    p.method === method &&
    (method === "VOUCHER" ? p.voucherId === voucherId : method === "PACKAGE" ? p.patientPackageId === patientPackageId : true);
  const existing = appointment.payments.find(sameKey) ?? null;

  const total = appointment.priceFinal ?? appointment.service?.price ?? appointment.priceEstimate ?? 0;
  const paidElsewhere = appointment.payments.filter((p) => !sameKey(p)).reduce((sum, p) => sum + p.amount, 0);
  const availableForMethod = Math.max(0, total - paidElsewhere);
  if (availableForMethod <= 0) {
    return NextResponse.json({ ok: false, message: "Cała należność została już rozliczona inną metodą" }, { status: 400 });
  }
  if (amount > availableForMethod) {
    return NextResponse.json({ ok: false, message: "Kwota przekracza należność dostępną dla tej metody" }, { status: 400 });
  }

  let detail = "";
  if (method === "VOUCHER") {
    const voucher = await prisma.voucher.findFirst({
      where: { id: voucherId, patientId: appointment.patientId },
      include: { payments: { select: { id: true, amount: true } } },
    });
    if (!voucher) return NextResponse.json({ ok: false, message: "Ten voucher nie należy do pacjenta tej wizyty" }, { status: 400 });
    const withoutThisVisit = voucher.payments.filter((p) => p.id !== existing?.id);
    const remaining = voucherRemaining(voucher.amount, withoutThisVisit);
    const status = benefitStatus({ canceledAt: voucher.canceledAt, expiresAt: voucher.expiresAt, remaining: Math.max(1, remaining) });
    if (status === "CANCELED") return NextResponse.json({ ok: false, message: "Voucher został anulowany" }, { status: 400 });
    if (status === "EXPIRED") return NextResponse.json({ ok: false, message: "Voucher stracił ważność" }, { status: 400 });
    if (amount > remaining) {
      return NextResponse.json(
        { ok: false, message: `Na voucherze zostało tylko ${formatPLNFromGrosze(remaining)}` },
        { status: 400 },
      );
    }
    detail = ` (voucher ${voucher.code})`;
  }
  if (method === "PACKAGE") {
    const pack = await prisma.patientPackage.findFirst({
      where: { id: patientPackageId, patientId: appointment.patientId },
      include: { payments: { select: { id: true, packageSessions: true } } },
    });
    if (!pack) return NextResponse.json({ ok: false, message: "Ten pakiet nie należy do pacjenta tej wizyty" }, { status: 400 });
    if (pack.serviceId && pack.serviceId !== appointment.serviceId) {
      return NextResponse.json({ ok: false, message: "Ten pakiet dotyczy innej usługi niż ta wizyta" }, { status: 400 });
    }
    const left = packageSessionsLeft(pack.sessionsTotal, pack.payments.filter((p) => p.id !== existing?.id));
    const status = benefitStatus({ canceledAt: pack.canceledAt, expiresAt: pack.expiresAt, remaining: Math.max(1, left) });
    if (status === "CANCELED") return NextResponse.json({ ok: false, message: "Pakiet został anulowany" }, { status: 400 });
    if (status === "EXPIRED") return NextResponse.json({ ok: false, message: "Pakiet stracił ważność" }, { status: 400 });
    if (packageSessions > left) {
      return NextResponse.json({ ok: false, message: `W pakiecie zostało tylko zabiegów: ${left}` }, { status: 400 });
    }
    detail = ` (pakiet ${pack.code}, zabiegów: ${packageSessions})`;
  }

  const replaced = Boolean(existing);
  const payment = await prisma.$transaction(async (tx) => {
    if (existing) await tx.payment.delete({ where: { id: existing.id } });
    return tx.payment.create({
      data: {
        appointmentId: params.id,
        method,
        amount,
        voucherId: method === "VOUCHER" ? voucherId : null,
        patientPackageId: method === "PACKAGE" ? patientPackageId : null,
        packageSessions: method === "PACKAGE" ? packageSessions : null,
      },
    });
  });

  await logAudit({
    actorId: user!.id,
    action: "CREATE",
    entity: "Payment",
    entityId: payment.id,
    summary: `Zapis płatności (${AUDIT_PAYMENT_METHOD_LABELS[method] ?? method})${detail}: ${formatPLNFromGrosze(amount)} za wizytę pacjenta ${appointment.patient.name}${
      replaced && existing ? ` — zastąpiono wcześniejszą wpłatę (${formatPLNFromGrosze(existing.amount)})` : ""
    }`,
    data: {
      appointmentId: params.id,
      method,
      amount,
      voucherId: voucherId ?? undefined,
      patientPackageId: patientPackageId ?? undefined,
      packageSessions: method === "PACKAGE" ? packageSessions : undefined,
      replaced,
      replacedAmount: existing?.amount,
    },
  });

  return NextResponse.json({ ok: true, payment, replaced });
}
