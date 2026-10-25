import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole, scopedLocationWhere } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { formatPLNFromGrosze } from "@/lib/money";
import { benefitStatus, parseExpiryDate, voucherRemaining } from "@/lib/vouchers";

export const dynamic = "force-dynamic";

const ROLES = ["ADMIN", "MANAGER", "RECEPTION"];

async function load(id: string, user: { locationScopeId: string | null }) {
  return prisma.voucher.findFirst({
    where: { id, patient: { ...scopedLocationWhere(user) } },
    include: {
      patient: { select: { id: true, name: true, phone: true } },
      createdBy: { select: { name: true } },
      payments: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          amount: true,
          createdAt: true,
          appointment: { select: { id: true, startsAt: true, customServiceName: true, service: { select: { name: true } } } },
        },
      },
    },
  });
}

// Szczegóły vouchera: saldo i historia wykorzystania.
export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ROLES);
  if (deny) return deny;

  const v = await load(params.id, user!);
  if (!v) return NextResponse.json({ ok: false, message: "Nie znaleziono vouchera" }, { status: 404 });
  const remaining = voucherRemaining(v.amount, v.payments);
  return NextResponse.json({
    ok: true,
    voucher: {
      id: v.id,
      code: v.code,
      title: v.title,
      amount: v.amount,
      remaining,
      expiresAt: v.expiresAt ? v.expiresAt.toISOString() : null,
      createdAt: v.createdAt.toISOString(),
      createdBy: v.createdBy?.name ?? null,
      saleMethod: v.saleMethod,
      note: v.note,
      canceledAt: v.canceledAt ? v.canceledAt.toISOString() : null,
      cancelReason: v.cancelReason,
      status: benefitStatus({ canceledAt: v.canceledAt, expiresAt: v.expiresAt, remaining }),
      patient: v.patient,
      usage: v.payments.map((p) => ({
        id: p.id,
        amount: p.amount,
        at: p.createdAt.toISOString(),
        appointmentId: p.appointment?.id ?? null,
        visitAt: p.appointment?.startsAt.toISOString() ?? null,
        serviceName: p.appointment ? p.appointment.customServiceName || p.appointment.service.name : null,
      })),
    },
  });
}

const PatchSchema = z.object({
  title: z.string().trim().min(2).max(120).optional(),
  expiresAt: z.string().optional().nullable(),
  note: z.string().trim().max(500).optional().nullable(),
  // Anulowanie vouchera (niewykorzystane saldo przepada) — administrator i manager.
  cancel: z.boolean().optional(),
  cancelReason: z.string().trim().max(300).optional(),
});

export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ROLES);
  if (deny) return deny;

  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, message: "Niepoprawne dane" }, { status: 400 });
  const v = await load(params.id, user!);
  if (!v) return NextResponse.json({ ok: false, message: "Nie znaleziono vouchera" }, { status: 404 });

  const data: { title?: string; expiresAt?: Date | null; note?: string | null; canceledAt?: Date; cancelReason?: string } = {};
  if (parsed.data.title !== undefined) data.title = parsed.data.title;
  if (parsed.data.note !== undefined) data.note = parsed.data.note || null;
  if (parsed.data.expiresAt !== undefined) {
    const expiresAt = parseExpiryDate(parsed.data.expiresAt ?? "");
    if (expiresAt === undefined) return NextResponse.json({ ok: false, message: "Niepoprawny termin ważności" }, { status: 400 });
    data.expiresAt = expiresAt;
  }
  if (parsed.data.cancel) {
    const strict = requireStrictRole(user!.role, ["ADMIN", "MANAGER"]);
    if (strict) return strict;
    if (v.canceledAt) return NextResponse.json({ ok: false, message: "Voucher jest już anulowany" }, { status: 409 });
    data.canceledAt = new Date();
    data.cancelReason = parsed.data.cancelReason || "Anulowano";
  }

  await prisma.voucher.update({ where: { id: v.id }, data });
  await logAudit({
    actorId: user!.id,
    action: "UPDATE",
    entity: "Voucher",
    entityId: v.id,
    summary: parsed.data.cancel
      ? `Anulowano voucher ${v.code} pacjenta ${v.patient.name} (niewykorzystane: ${formatPLNFromGrosze(voucherRemaining(v.amount, v.payments))})`
      : `Zmiana vouchera ${v.code} pacjenta ${v.patient.name}`,
    data: { ...parsed.data },
  });
  return NextResponse.json({ ok: true });
}
