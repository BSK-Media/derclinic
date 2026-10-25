import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole, scopedLocationWhere } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { benefitStatus, packageSessionsLeft, parseExpiryDate } from "@/lib/vouchers";

export const dynamic = "force-dynamic";

const ROLES = ["ADMIN", "MANAGER", "RECEPTION"];

async function load(id: string, user: { locationScopeId: string | null }) {
  return prisma.patientPackage.findFirst({
    where: { id, patient: { ...scopedLocationWhere(user) } },
    include: {
      patient: { select: { id: true, name: true, phone: true } },
      service: { select: { name: true } },
      createdBy: { select: { name: true } },
      payments: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          amount: true,
          packageSessions: true,
          createdAt: true,
          appointment: { select: { id: true, startsAt: true, customServiceName: true, service: { select: { name: true } } } },
        },
      },
    },
  });
}

// Szczegóły pakietu: ile zabiegów zostało i historia rozliczeń.
export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ROLES);
  if (deny) return deny;

  const p = await load(params.id, user!);
  if (!p) return NextResponse.json({ ok: false, message: "Nie znaleziono pakietu" }, { status: 404 });
  const left = packageSessionsLeft(p.sessionsTotal, p.payments);
  return NextResponse.json({
    ok: true,
    package: {
      id: p.id,
      code: p.code,
      title: p.title,
      serviceName: p.service?.name ?? null,
      sessionsTotal: p.sessionsTotal,
      sessionsLeft: left,
      price: p.price,
      expiresAt: p.expiresAt ? p.expiresAt.toISOString() : null,
      createdAt: p.createdAt.toISOString(),
      createdBy: p.createdBy?.name ?? null,
      saleMethod: p.saleMethod,
      note: p.note,
      canceledAt: p.canceledAt ? p.canceledAt.toISOString() : null,
      cancelReason: p.cancelReason,
      status: benefitStatus({ canceledAt: p.canceledAt, expiresAt: p.expiresAt, remaining: left }),
      patient: p.patient,
      usage: p.payments.map((x) => ({
        id: x.id,
        sessions: x.packageSessions ?? 0,
        at: x.createdAt.toISOString(),
        appointmentId: x.appointment?.id ?? null,
        visitAt: x.appointment?.startsAt.toISOString() ?? null,
        serviceName: x.appointment ? x.appointment.customServiceName || x.appointment.service.name : null,
      })),
    },
  });
}

const PatchSchema = z.object({
  title: z.string().trim().min(2).max(120).optional(),
  expiresAt: z.string().optional().nullable(),
  note: z.string().trim().max(500).optional().nullable(),
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
  const p = await load(params.id, user!);
  if (!p) return NextResponse.json({ ok: false, message: "Nie znaleziono pakietu" }, { status: 404 });

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
    if (p.canceledAt) return NextResponse.json({ ok: false, message: "Pakiet jest już anulowany" }, { status: 409 });
    data.canceledAt = new Date();
    data.cancelReason = parsed.data.cancelReason || "Anulowano";
  }

  await prisma.patientPackage.update({ where: { id: p.id }, data });
  await logAudit({
    actorId: user!.id,
    action: "UPDATE",
    entity: "PatientPackage",
    entityId: p.id,
    summary: parsed.data.cancel
      ? `Anulowano pakiet ${p.code} pacjenta ${p.patient.name} (pozostało zabiegów: ${packageSessionsLeft(p.sessionsTotal, p.payments)})`
      : `Zmiana pakietu ${p.code} pacjenta ${p.patient.name}`,
    data: { ...parsed.data },
  });
  return NextResponse.json({ ok: true });
}
