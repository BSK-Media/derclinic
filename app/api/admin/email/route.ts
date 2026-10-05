import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole } from "@/lib/api-helpers";
import { logAudit, diffFields } from "@/lib/audit";
import { mailerConfig } from "@/lib/mailer";
import { getEmailSettings, saveEmailSettings } from "@/lib/email-notifications";
import { EMAIL_TYPE_INFO } from "@/lib/email-types";

const TOGGLEABLE_TYPES = EMAIL_TYPE_INFO.filter((info) => info.toggleable).map((info) => info.type as string);

// Stan konfiguracji, ustawienia i dziennik wysyłek — wyłącznie administrator.
export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [settings, logs, weekCounts] = await Promise.all([
    getEmailSettings(),
    prisma.emailLog.findMany({
      // Dziennik jest wspólny z powiadomieniami push — tu tylko e-maile.
      where: { channel: "EMAIL" },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, createdAt: true, type: true, recipient: true, subject: true, status: true, error: true },
    }),
    prisma.emailLog.groupBy({ by: ["status"], where: { channel: "EMAIL", createdAt: { gte: weekAgo } }, _count: { _all: true } }),
  ]);

  const mailer = mailerConfig();
  return NextResponse.json({
    ok: true,
    config: {
      // Sam klucz nigdy nie opuszcza serwera — tylko informacja, czy jest.
      apiKeySet: mailer.apiKeySet,
      from: mailer.from,
      appUrl: process.env.NEXT_PUBLIC_APP_URL || null,
      cronSecretSet: Boolean(process.env.CRON_SECRET),
    },
    settings,
    logs,
    lastWeek: Object.fromEntries(weekCounts.map((row) => [row.status, row._count._all])),
  });
}

const emailField = z.string().trim().email("Niepoprawny adres e-mail").max(200);

const SettingsSchema = z.object({
  disabledTypes: z.array(z.string()).max(20),
  staffRecipients: z.array(emailField).max(20, "Maksymalnie 20 adresów"),
  notifySpecialist: z.boolean(),
  replyTo: emailField.nullable().or(z.literal("").transform(() => null)),
});

export async function PUT(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const parsed = SettingsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: parsed.error.issues[0]?.message ?? "Niepoprawne dane" },
      { status: 400 },
    );
  }

  const before = await getEmailSettings();
  const next = {
    // Wiadomości technicznych (reset hasła, test) nie da się wyłączyć.
    disabledTypes: TOGGLEABLE_TYPES.filter((type) => parsed.data.disabledTypes.includes(type)),
    staffRecipients: Array.from(new Map(parsed.data.staffRecipients.map((e) => [e.toLowerCase(), e])).values()),
    notifySpecialist: parsed.data.notifySpecialist,
    replyTo: parsed.data.replyTo,
  };
  await saveEmailSettings(next);

  await logAudit({
    actorId: user!.id,
    action: "UPDATE",
    entity: "EmailSettings",
    summary: "Zmiana ustawień poczty e-mail",
    data: { changes: diffFields(before, next) },
  });

  return NextResponse.json({ ok: true, settings: next });
}
