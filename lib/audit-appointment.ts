import { APPOINTMENT_STATUS_LABELS } from "@/lib/appointment-status";
import { formatPLNFromGrosze } from "@/lib/money";
import { clip, formatWarsaw, type FieldChange } from "@/lib/audit-format";

// Pola wizyty, których zmiana trafia do dziennika jako "przed → po".
export const APPOINTMENT_AUDIT_FIELDS = [
  "status",
  "priceFinal",
  "priceEstimate",
  "note",
  "startsAt",
  "endsAt",
  "specialistId",
  "serviceId",
] as const;

export type AppointmentSnapshot = {
  status: string;
  priceFinal: number | null;
  priceEstimate: number | null;
  note: string | null;
  startsAt: Date;
  endsAt: Date;
  specialistId: string;
  serviceId: string;
};

/** Wycina z rekordu wizyty tylko pola, które porównujemy w dzienniku. */
export function appointmentSnapshot(a: AppointmentSnapshot): Record<string, unknown> {
  return {
    status: a.status,
    priceFinal: a.priceFinal,
    priceEstimate: a.priceEstimate,
    note: a.note,
    startsAt: a.startsAt,
    endsAt: a.endsAt,
    specialistId: a.specialistId,
    serviceId: a.serviceId,
  };
}

function statusLabel(value: unknown) {
  return typeof value === "string" ? (APPOINTMENT_STATUS_LABELS[value] ?? value) : "—";
}

function money(value: unknown) {
  return typeof value === "number" ? formatPLNFromGrosze(value) : "—";
}

/**
 * Czytelny opis zmian wizyty po polsku, np.
 * "status: Zaplanowana → Zakończona; termin: 12.10.2026 10:00 → 12.10.2026 11:00".
 * Zwraca "bez zmian wartości", gdy nic się nie zmieniło.
 */
export function describeAppointmentChanges(changes: Record<string, FieldChange> | undefined): string {
  if (!changes) return "bez zmian wartości";
  const parts: string[] = [];

  if (changes.status) parts.push(`status: ${statusLabel(changes.status.from)} → ${statusLabel(changes.status.to)}`);
  if (changes.startsAt || changes.endsAt) {
    const start = changes.startsAt;
    const end = changes.endsAt;
    parts.push(
      start
        ? `termin: ${formatWarsaw(start.from as string)} → ${formatWarsaw(start.to as string)}`
        : `godzina zakończenia: ${formatWarsaw(end!.from as string)} → ${formatWarsaw(end!.to as string)}`,
    );
  }
  if (changes.priceFinal) parts.push(`cena końcowa: ${money(changes.priceFinal.from)} → ${money(changes.priceFinal.to)}`);
  if (changes.priceEstimate) {
    parts.push(`cena standardowa: ${money(changes.priceEstimate.from)} → ${money(changes.priceEstimate.to)}`);
  }
  if (changes.specialistId) parts.push("zmieniono specjalistę");
  if (changes.serviceId) parts.push("zmieniono zabieg");
  if (changes.note) {
    parts.push(changes.note.to ? `notatka: „${clip(String(changes.note.to), 80)}"` : "usunięto notatkę");
  }
  return parts.join("; ");
}
