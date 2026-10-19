import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import {
  RFM_MAX_WINDOW_DAYS,
  RFM_MIN_WINDOW_DAYS,
  DEFAULT_RFM_RULES,
  DEFAULT_RFM_THRESHOLDS,
  parseRfmRules,
  parseRfmThresholds,
} from "@/lib/rfm";
import { RFM_SETTINGS_ID, getRfmSettings } from "@/lib/rfm-settings";

// Ustawienia analizy RFM: odczyt dla administratora i managera, zapis tylko dla administratora.

export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN", "MANAGER"]);
  if (deny) return deny;
  return NextResponse.json({ ok: true, settings: await getRfmSettings(), defaults: DEFAULT_RFM_THRESHOLDS, defaultRules: DEFAULT_RFM_RULES });
}

const BodySchema = z.object({
  // 0 = cała historia pacjenta; inaczej okno w dniach.
  windowDays: z.coerce
    .number()
    .int()
    .refine((value) => value === 0 || (value >= RFM_MIN_WINDOW_DAYS && value <= RFM_MAX_WINDOW_DAYS)),
  thresholds: z.unknown().nullable().optional(),
  rules: z.unknown().nullable().optional(),
});

export async function PUT(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: `Okno obliczeń: 0 (cała historia) albo ${RFM_MIN_WINDOW_DAYS}–${RFM_MAX_WINDOW_DAYS} dni` },
      { status: 400 },
    );
  }
  const rawThresholds = parsed.data.thresholds ?? null;
  const thresholds = rawThresholds === null ? null : parseRfmThresholds(rawThresholds);
  if (rawThresholds !== null && !thresholds) {
    return NextResponse.json(
      { ok: false, message: "Progi muszą być czterema rosnącymi liczbami (nieujemnymi) w każdej grupie" },
      { status: 400 },
    );
  }

  const rawRules = parsed.data.rules ?? null;
  const rules = rawRules === null ? null : parseRfmRules(rawRules);
  if (rawRules !== null && !rules) {
    return NextResponse.json({ ok: false, message: "Reguły segmentów: zakresy ocen muszą być liczbami 1–5, od ≤ do" }, { status: 400 });
  }

  const before = await getRfmSettings();
  const windowDays = parsed.data.windowDays;
  const stored = thresholds ?? Prisma.DbNull;
  await prisma.rfmSettings.upsert({
    where: { id: RFM_SETTINGS_ID },
    create: { id: RFM_SETTINGS_ID, windowDays, thresholds: stored, segmentRules: rules ?? Prisma.DbNull },
    update: { windowDays, thresholds: stored, segmentRules: rules ?? Prisma.DbNull },
  });

  await logAudit({
    actorId: user!.id,
    action: "UPDATE",
    entity: "RfmSettings",
    entityId: RFM_SETTINGS_ID,
    summary: "Zmiana ustawień segmentacji pacjentów RFM (Ustawienia → Segmentacja pacjentów)",
    data: { before, after: { windowDays, thresholds, rules } },
  });

  return NextResponse.json({ ok: true, settings: await getRfmSettings() });
}
