import { prisma } from "@/lib/db";
import { RFM_WINDOW_DAYS, parseRfmThresholds, type RfmThresholds } from "@/lib/rfm";

// Ustawienia analizy RFM zapisane w Ustawieniach → Segmentacja pacjentów (RFM). Jeden wiersz o stałym identyfikatorze.
export const RFM_SETTINGS_ID = "rfm";

export type RfmSettingsValue = { windowDays: number; thresholds: RfmThresholds | null };

export async function getRfmSettings(): Promise<RfmSettingsValue> {
  const row = await prisma.rfmSettings.findUnique({ where: { id: RFM_SETTINGS_ID } });
  return {
    windowDays: row?.windowDays ?? RFM_WINDOW_DAYS,
    thresholds: parseRfmThresholds(row?.thresholds),
  };
}
