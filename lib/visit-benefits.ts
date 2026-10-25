import type { Prisma, PrismaClient } from "@prisma/client";
import { PACKAGE_INCLUDE, summarizePackage, type PackageWithItems } from "@/lib/package-summary";
import { benefitStatus, packageItemForService, voucherRemaining } from "@/lib/vouchers";

// Vouchery i pakiety, którymi można rozliczyć konkretną wizytę (karta wizyty, zapis płatności).
// Voucher (anonimowy lub imienny na dowolne nazwisko) realizuje każdy, kto go przyniesie. Pakiet imienny — tylko jego
// posiadacz; pakiet anonimowy — każdy pacjent. Bez kodu karta wizyty podpowiada vouchery kupione przez pacjenta oraz
// jego pakiety (imienne i kupione przez niego anonimowe); pozostałe odszukuje się kodem.

type Db = PrismaClient | Prisma.TransactionClient;
type Visit = { id: string; patientId: string; serviceId: string | null };

const VOUCHER_INCLUDE = { payments: { select: { id: true, amount: true, appointmentId: true } } } as const;
type VoucherWithPayments = Prisma.VoucherGetPayload<{ include: typeof VOUCHER_INCLUDE }>;

export type VisitVoucher = ReturnType<typeof shapeVoucher>;
export type VisitPackage = ReturnType<typeof shapePackage>;

function shapeVoucher(v: VoucherWithPayments, visit: Visit) {
  const remaining = voucherRemaining(v.amount, v.payments);
  const usedHere = v.payments.filter((p) => p.appointmentId === visit.id).reduce((sum, p) => sum + p.amount, 0);
  return {
    id: v.id,
    code: v.code,
    title: v.title,
    recipientName: v.recipientName,
    remaining,
    // Saldo dostępne dla tej wizyty (łącznie z kwotą już z niej pobraną).
    availableHere: remaining + usedHere,
    expiresAt: v.expiresAt ? v.expiresAt.toISOString() : null,
    status: benefitStatus({ canceledAt: v.canceledAt, expiresAt: v.expiresAt, remaining: Math.max(1, remaining + usedHere) }),
  };
}

function shapePackage(p: PackageWithItems, visit: Visit) {
  const hereIds = p.payments.filter((x) => x.appointmentId === visit.id).map((x) => x.id);
  // Pozostałe zabiegi bez rozliczeń tej wizyty — żeby dało się zmienić już zapisane rozliczenie.
  const summary = summarizePackage(p, { excludePaymentIds: hereIds });
  const item = packageItemForService(summary.items, visit.serviceId);
  return {
    id: p.id,
    code: p.code,
    title: p.title,
    holderName: p.holder?.name ?? null,
    anonymous: !p.holderPatientId,
    itemId: item?.id ?? null,
    itemServiceName: item ? (item.serviceName ?? "dowolna usługa") : null,
    availableHere: item?.left ?? 0,
    servicesLabel: summary.servicesLabel,
    expiresAt: p.expiresAt ? p.expiresAt.toISOString() : null,
    status: benefitStatus({ canceledAt: p.canceledAt, expiresAt: p.expiresAt, remaining: Math.max(1, item?.left ?? 0) }),
    holderOk: !p.holderPatientId || p.holderPatientId === visit.patientId,
  };
}

/** Dlaczego voucher nie nadaje się do tej wizyty (null = nadaje się). */
export function voucherProblem(v: VisitVoucher) {
  if (v.status === "CANCELED") return "Voucher został anulowany";
  if (v.status === "EXPIRED") return "Voucher stracił ważność";
  if (v.availableHere <= 0) return "Voucher został już wykorzystany";
  return null;
}

/** Dlaczego pakiet nie nadaje się do tej wizyty (null = nadaje się). */
export function packageProblem(p: VisitPackage) {
  if (!p.holderOk) return `To pakiet imienny dla: ${p.holderName ?? "innego pacjenta"}`;
  if (p.status === "CANCELED") return "Pakiet został anulowany";
  if (p.status === "EXPIRED") return "Pakiet stracił ważność";
  if (!p.itemId) return "Pakiet nie obejmuje usługi tej wizyty";
  if (p.availableHere <= 0) return `W pakiecie nie zostały zabiegi: ${p.itemServiceName}`;
  return null;
}

/** Vouchery i pakiety podpowiadane na karcie wizyty (oraz te już nią rozliczone). */
export async function visitBenefits(db: Db, visit: Visit) {
  const [vouchers, packages] = await Promise.all([
    db.voucher.findMany({
      where: { OR: [{ patientId: visit.patientId }, { payments: { some: { appointmentId: visit.id } } }] },
      orderBy: { createdAt: "asc" },
      include: VOUCHER_INCLUDE,
    }),
    db.patientPackage.findMany({
      where: {
        OR: [
          { holderPatientId: visit.patientId },
          { holderPatientId: null, patientId: visit.patientId },
          { payments: { some: { appointmentId: visit.id } } },
        ],
      },
      orderBy: { createdAt: "asc" },
      include: PACKAGE_INCLUDE,
    }),
  ]);
  return {
    vouchers: vouchers.map((v) => shapeVoucher(v, visit)),
    packages: packages.map((p) => shapePackage(p, visit)),
  };
}

/** Voucher lub pakiet o podanym kodzie, w kształcie jak na karcie wizyty. */
export async function visitBenefitByCode(db: Db, visit: Visit, code: string, scope: Prisma.PatientWhereInput) {
  const normalized = code.trim().toUpperCase();
  const [voucher, pack] = await Promise.all([
    db.voucher.findFirst({ where: { code: normalized, patient: scope }, include: VOUCHER_INCLUDE }),
    db.patientPackage.findFirst({ where: { code: normalized, patient: scope }, include: PACKAGE_INCLUDE }),
  ]);
  return {
    voucher: voucher ? shapeVoucher(voucher, visit) : null,
    package: pack ? shapePackage(pack, visit) : null,
  };
}

/** Jeden voucher / pakiet po identyfikatorze (zapis płatności). */
export async function visitVoucherById(db: Db, visit: Visit, voucherId: string, scope: Prisma.PatientWhereInput) {
  const voucher = await db.voucher.findFirst({ where: { id: voucherId, patient: scope }, include: VOUCHER_INCLUDE });
  return voucher ? shapeVoucher(voucher, visit) : null;
}

export async function visitPackageById(db: Db, visit: Visit, packageId: string, scope: Prisma.PatientWhereInput) {
  const pack = await db.patientPackage.findFirst({ where: { id: packageId, patient: scope }, include: PACKAGE_INCLUDE });
  return pack ? shapePackage(pack, visit) : null;
}
