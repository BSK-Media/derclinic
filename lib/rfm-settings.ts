import { prisma } from "@/lib/db";
import {
  DEFAULT_RFM_RULES,
  DEFAULT_RFM_THRESHOLDS,
  RFM_WINDOW_DAYS,
  parseRfmRules,
  parseRfmThresholds,
  type RfmRule,
  type RfmThresholds,
} from "@/lib/rfm";

// Ustawienia analizy RFM zapisane w Ustawieniach → Segmentacja pacjentów (RFM). Jeden wiersz o stałym identyfikatorze.
export const RFM_SETTINGS_ID = "rfm";

export type RfmSettingsValue = { windowDays: number; thresholds: RfmThresholds | null; rules: RfmRule[] };

export async function getRfmSettings(): Promise<RfmSettingsValue> {
  const row = await prisma.rfmSettings.findUnique({ where: { id: RFM_SETTINGS_ID } });
  // Bez zapisanych ustawień obowiązuje skala domyślna (z danych kliniki). Zapisany wiersz bez progów to świadomy
  // wybór oceniania automatycznego (kwintyle).
  if (!row) return { windowDays: RFM_WINDOW_DAYS, thresholds: DEFAULT_RFM_THRESHOLDS, rules: DEFAULT_RFM_RULES };
  return {
    windowDays: row.windowDays,
    thresholds: parseRfmThresholds(row.thresholds),
    rules: parseRfmRules(row.segmentRules) ?? DEFAULT_RFM_RULES,
  };
}
