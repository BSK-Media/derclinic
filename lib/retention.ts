// Okresy przechowywania danych (patrz dokumentacja, pkt 5.2 i 7.6). Wartości są
// propozycją do potwierdzenia przez prawnika — zmiana w jednym miejscu.

/** Dokumentacja medyczna: 20 lat od końca roku kalendarzowego, w którym dokonano ostatniego wpisu. */
export const MEDICAL_RETENTION_YEARS = 20;

/** Dziennik wysyłki e-mail i podobne dane techniczne. */
export const EMAIL_LOG_RETENTION_DAYS = 365;

/** Znaczniki przeczytanych powiadomień. */
export const NOTIFICATION_READ_RETENTION_DAYS = 90;

/** Do kiedy (włącznie) trzeba przechowywać dokumentację, której ostatni wpis pochodzi z `lastEntry`. */
export function medicalRetentionEnd(lastEntry: Date): Date {
  return new Date(Date.UTC(lastEntry.getUTCFullYear() + MEDICAL_RETENTION_YEARS, 11, 31, 23, 59, 59));
}
