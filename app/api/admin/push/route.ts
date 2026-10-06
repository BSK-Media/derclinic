import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { getDisabledPushTypes, saveDisabledPushTypes } from "@/lib/push";
import { EMAIL_TYPE_INFO } from "@/lib/email-types";

const TOGGLEABLE_TYPES = EMAIL_TYPE_INFO.filter((info) => info.toggleable).map((info) => info.type as string);

// Stan powiadomień push, ustawienia i dziennik wysyłek — wyłącznie administrator.
export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN", "MANAGER"]);
  if (deny) return deny;

  const [disabledPushTypes, patientDevices, patients, staffDevices, staff, marketingPatients, logs] = await Promise.all([
    getDisabledPushTypes(),
    prisma.pushSubscription.count({ where: { patientId: { not: null } } }),
    prisma.patient.count({ where: { pushSubscriptions: { some: {} } } }),
    prisma.pushSubscription.count({ where: { userId: { not: null } } }),
    prisma.user.count({ where: { pushSubscriptions: { some: {} } } }),
    prisma.patient.count({
      where: { pushSubscriptions: { some: {} }, consents: { some: { type: "MARKETING", granted: true } } },
    }),
    prisma.emailLog.findMany({
      where: { channel: "PUSH" },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, createdAt: true, type: true, recipient: true, subject: true, status: true, error: true },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    disabledPushTypes,
    stats: { patientDevices, patients, staffDevices, staff, marketingPatients },
    logs,
  });
}

const SettingsSchema = z.object({ disabledPushTypes: z.array(z.string()).max(20) });

export async function PUT(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN", "MANAGER"]);
  if (deny) return deny;

  const parsed = SettingsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, message: "Niepoprawne dane" }, { status: 400 });

  const before = await getDisabledPushTypes();
  const next = TOGGLEABLE_TYPES.filter((type) => parsed.data.disabledPushTypes.includes(type));
  await saveDisabledPushTypes(next);

  await logAudit({
    actorId: user!.id,
    action: "UPDATE",
    entity: "PushSettings",
    summary: "Zmiana ustawień powiadomień push",
    data: { disabledBefore: before, disabledAfter: next },
  });

  return NextResponse.json({ ok: true, disabledPushTypes: next });
}
