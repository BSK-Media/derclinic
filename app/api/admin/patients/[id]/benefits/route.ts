import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole, scopedLocationWhere } from "@/lib/api-helpers";
import { benefitStatus, voucherRemaining } from "@/lib/vouchers";
import { PACKAGE_INCLUDE, summarizePackage } from "@/lib/package-summary";

export const dynamic = "force-dynamic";

// Vouchery kupione przez pacjenta oraz jego pakiety (kupione lub imienne) wraz z wykorzystaniem — do karty pacjenta.
export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN", "MANAGER", "RECEPTION"]);
  if (deny) return deny;

  const patient = await prisma.patient.findFirst({ where: { id: params.id, ...scopedLocationWhere(user!) }, select: { id: true } });
  if (!patient) return NextResponse.json({ ok: false, message: "Nie znaleziono pacjenta" }, { status: 404 });

  const paymentSelect = {
    id: true,
    amount: true,
    packageSessions: true,
    createdAt: true,
    appointment: { select: { id: true, startsAt: true, customServiceName: true, service: { select: { name: true } } } },
  } as const;

  const [vouchers, packages] = await Promise.all([
    prisma.voucher.findMany({
      where: { patientId: patient.id },
      orderBy: { createdAt: "desc" },
      include: { payments: { orderBy: { createdAt: "asc" }, select: paymentSelect } },
    }),
    // Pakiety kupione przez pacjenta i pakiety imienne, z których pacjent korzysta.
    prisma.patientPackage.findMany({
      where: { OR: [{ patientId: patient.id }, { holderPatientId: patient.id }] },
      orderBy: { createdAt: "desc" },
      include: {
        ...PACKAGE_INCLUDE,
        payments: { orderBy: { createdAt: "asc" }, select: { ...paymentSelect, patientPackageItemId: true, appointmentId: true } },
      },
    }),
  ]);

  const usage = (p: (typeof vouchers)[number]["payments"][number]) => ({
    id: p.id,
    amount: p.amount,
    sessions: p.packageSessions,
    at: p.createdAt.toISOString(),
    appointmentId: p.appointment?.id ?? null,
    visitAt: p.appointment?.startsAt.toISOString() ?? null,
    serviceName: p.appointment ? p.appointment.customServiceName || p.appointment.service.name : null,
  });

  return NextResponse.json({
    ok: true,
    vouchers: vouchers.map((v) => {
      const remaining = voucherRemaining(v.amount, v.payments);
      return {
        id: v.id,
        code: v.code,
        title: v.title,
        recipientName: v.recipientName,
        amount: v.amount,
        remaining,
        expiresAt: v.expiresAt ? v.expiresAt.toISOString() : null,
        status: benefitStatus({ canceledAt: v.canceledAt, expiresAt: v.expiresAt, remaining }),
        usage: v.payments.map(usage),
      };
    }),
    packages: packages.map((p) => {
      const summary = summarizePackage(p);
      return {
        id: p.id,
        code: p.code,
        title: p.title,
        items: summary.items,
        sessionsTotal: p.sessionsTotal,
        sessionsLeft: summary.sessionsLeft,
        expiresAt: p.expiresAt ? p.expiresAt.toISOString() : null,
        status: summary.status,
        buyer: p.patient,
        holder: p.holder,
        usage: p.payments.map(usage),
      };
    }),
  });
}
