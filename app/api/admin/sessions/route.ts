import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { requireStepUp } from "@/lib/mfa";
import { SESSION_POLICY } from "@/lib/session-core";

const PATIENT_SESSIONS_LIMIT = 200;

// Sesja jest aktywna, gdy nie została unieważniona, nie wygasła i nie
// przekroczyła limitu bezczynności — te same warunki co przy logowaniu
// (lib/session-core.ts).
function activeWhere(idleMs: number) {
  const now = new Date();
  return {
    revokedAt: null,
    expiresAt: { gt: now },
    lastSeenAt: { gt: new Date(now.getTime() - idleMs) },
  };
}

// Aktywne sesje personelu i klientów — wyłącznie administrator.
export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const patientWhere = activeWhere(SESSION_POLICY.patient.idleMs);
  const [staff, patients, patientTotal] = await Promise.all([
    prisma.staffSession.findMany({
      where: activeWhere(SESSION_POLICY.staff.idleMs),
      orderBy: { lastSeenAt: "desc" },
      select: {
        id: true,
        createdAt: true,
        lastSeenAt: true,
        expiresAt: true,
        mfaMethod: true,
        ipAddress: true,
        userAgent: true,
        operator: { select: { name: true } },
        user: { select: { id: true, name: true, login: true, role: true } },
      },
    }),
    prisma.patientSession.findMany({
      where: patientWhere,
      orderBy: { lastSeenAt: "desc" },
      take: PATIENT_SESSIONS_LIMIT,
      select: {
        id: true,
        createdAt: true,
        lastSeenAt: true,
        expiresAt: true,
        ipAddress: true,
        userAgent: true,
        patient: { select: { id: true, name: true } },
      },
    }),
    prisma.patientSession.count({ where: patientWhere }),
  ]);

  return NextResponse.json({
    ok: true,
    staff: staff.map((session) => ({ ...session, current: session.id === user!.sessionId })),
    patients,
    patientTotal,
    policy: {
      staffIdleHours: SESSION_POLICY.staff.idleMs / 3_600_000,
      staffMaxHours: SESSION_POLICY.staff.absoluteMs / 3_600_000,
      patientIdleDays: SESSION_POLICY.patient.idleMs / 86_400_000,
      patientMaxDays: SESSION_POLICY.patient.absoluteMs / 86_400_000,
    },
  });
}

const RevokeSchema = z.object({
  kind: z.enum(["staff", "patient"]),
  id: z.string().min(1).max(200),
});

// Zakończenie jednej, wskazanej sesji (wylogowanie z jednego urządzenia).
// Wymaga ponownego MFA administratora i trafia do dziennika.
export async function DELETE(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN"]);
  if (deny) return deny;
  const stepUp = requireStepUp(user!);
  if (stepUp) return stepUp;

  const parsed = RevokeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, message: "Niepoprawne dane" }, { status: 400 });
  const { kind, id } = parsed.data;

  if (kind === "staff") {
    if (id === user!.sessionId) {
      return NextResponse.json(
        { ok: false, message: "To Twoja bieżąca sesja — aby ją zakończyć, użyj przycisku „Wyloguj”." },
        { status: 400 },
      );
    }
    const session = await prisma.staffSession.findUnique({
      where: { id },
      select: { revokedAt: true, user: { select: { id: true, name: true, login: true } } },
    });
    if (!session) return NextResponse.json({ ok: false, message: "Nie znaleziono sesji" }, { status: 404 });
    if (!session.revokedAt) {
      await prisma.staffSession.update({
        where: { id },
        data: { revokedAt: new Date(), revokedReason: "admin_revoked" },
      });
    }
    await logAudit({
      actorId: user!.id,
      action: "SESSION_REVOKE",
      entity: "User",
      entityId: session.user.id,
      summary: `Administrator zakończył sesję pracownika „${session.user.login}" (${session.user.name})`,
      data: { kind, single: true },
    });
    return NextResponse.json({ ok: true });
  }

  const session = await prisma.patientSession.findUnique({
    where: { id },
    select: { revokedAt: true, patient: { select: { id: true, name: true } } },
  });
  if (!session) return NextResponse.json({ ok: false, message: "Nie znaleziono sesji" }, { status: 404 });
  if (!session.revokedAt) {
    await prisma.patientSession.update({
      where: { id },
      data: { revokedAt: new Date(), revokedReason: "admin_revoked" },
    });
  }
  await logAudit({
    actorId: user!.id,
    action: "SESSION_REVOKE",
    entity: "PatientAccount",
    entityId: session.patient.id,
    summary: `Administrator zakończył sesję klienta ${session.patient.name} w panelu klienta`,
    data: { kind, single: true },
  });
  return NextResponse.json({ ok: true });
}
