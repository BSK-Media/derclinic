import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { RFM_MAX_WINDOW_DAYS, RFM_MIN_WINDOW_DAYS, DEFAULT_RFM_THRESHOLDS, parseRfmThresholds } from "@/lib/rfm";
import { RFM_SETTINGS_ID, getRfmSettings } from "@/lib/rfm-settings";

// Ustawienia analizy RFM: odczyt dla administratora i managera, zapis tylko dla administratora.

export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN", "MANAGER"]);
  if (deny) return deny;
  return NextResponse.json({ ok: true, settings: await getRfmSettings(), defaults: DEFAULT_RFM_THRESHOLDS });
}

const BodySchema = z.object({
  windowDays: z.coerce.number().int().min(RFM_MIN_WINDOW_DAYS).max(RFM_MAX_WINDOW_DAYS),
  thresholds: z.unknown().nullable().optional(),
});

export async function PUT(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: `Okno obliczeń musi mieścić się w zakresie ${RFM_MIN_WINDOW_DAYS}–${RFM_MAX_WINDOW_DAYS} dni` },
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

  const before = await getRfmSettings();
  const windowDays = parsed.data.windowDays;
  const stored = thresholds ?? Prisma.DbNull;
  await prisma.rfmSettings.upsert({
    where: { id: RFM_SETTINGS_ID },
    create: { id: RFM_SETTINGS_ID, windowDays, thresholds: stored },
    update: { windowDays, thresholds: stored },
  });

  await logAudit({
    actorId: user!.id,
    action: "UPDATE",
    entity: "RfmSettings",
    entityId: RFM_SETTINGS_ID,
    summary: "Zmiana ustawień segmentacji pacjentów RFM (Ustawienia → Segmentacja pacjentów)",
    data: { before, after: { windowDays, thresholds } },
  });

  return NextResponse.json({ ok: true, settings: await getRfmSettings() });
}
