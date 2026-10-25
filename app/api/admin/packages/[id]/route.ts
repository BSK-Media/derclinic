import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole, scopedLocationWhere } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { parseExpiryDate } from "@/lib/vouchers";
import { PACKAGE_INCLUDE, summarizePackage } from "@/lib/package-summary";

export const dynamic = "force-dynamic";

const ROLES = ["ADMIN", "MANAGER", "RECEPTION"];

async function load(id: string, user: { locationScopeId: string | null }) {
  return prisma.patientPackage.findFirst({
    where: { id, patient: { ...scopedLocationWhere(user) } },
    include: {
      ...PACKAGE_INCLUDE,
      createdBy: { select: { name: true } },
      payments: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          amount: true,
          packageSessions: true,
          patientPackageItemId: true,
          appointmentId: true,
          createdAt: true,
          appointment: {
            select: {
              id: true,
              startsAt: true,
              customServiceName: true,
              service: { select: { name: true } },
              patient: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  });
}

// Szczegóły pakietu: pozostałe zabiegi w rozbiciu na usługi i historia rozliczeń.
export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ROLES);
  if (deny) return deny;

  const p = await load(params.id, user!);
  if (!p) return NextResponse.json({ ok: false, message: "Nie znaleziono pakietu" }, { status: 404 });
  const summary = summarizePackage(p);
  return NextResponse.json({
    ok: true,
    package: {
      id: p.id,
      code: p.code,
      title: p.title,
      servicesLabel: summary.servicesLabel,
      items: summary.items,
      sessionsTotal: p.sessionsTotal,
      sessionsLeft: summary.sessionsLeft,
      price: p.price,
      standardValue: p.standardValue,
      expiresAt: p.expiresAt ? p.expiresAt.toISOString() : null,
      createdAt: p.createdAt.toISOString(),
      createdBy: p.createdBy?.name ?? null,
      saleMethod: p.saleMethod,
      note: p.note,
      canceledAt: p.canceledAt ? p.canceledAt.toISOString() : null,
      cancelReason: p.cancelReason,
      status: summary.status,
      patient: p.patient,
      holder: p.holder,
      usage: p.payments.map((x) => ({
        id: x.id,
        sessions: x.packageSessions ?? 0,
        at: x.createdAt.toISOString(),
        appointmentId: x.appointment?.id ?? null,
        visitAt: x.appointment?.startsAt.toISOString() ?? null,
        serviceName: x.appointment ? x.appointment.customServiceName || x.appointment.service.name : null,
        // Przy pakiecie anonimowym ważne, kto z niego skorzystał.
        patientName: x.appointment?.patient.name ?? null,
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
      ? `Anulowano pakiet ${p.code} (kupujący ${p.patient.name}; pozostało zabiegów: ${summarizePackage(p).sessionsLeft})`
      : `Zmiana pakietu ${p.code} (kupujący ${p.patient.name})`,
    data: { ...parsed.data },
  });
  return NextResponse.json({ ok: true });
}
