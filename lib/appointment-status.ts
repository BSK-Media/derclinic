export const APPOINTMENT_STATUS_LABELS: Record<string, string> = {
  SCHEDULED: "Zaplanowana",
  AWAITING: "Oczekujące",
  COMPLETED: "Zakończona",
  CANCELED: "Odwołana",
  NO_SHOW: "Nieobecność pacjenta",
};

/**
 * AWAITING is a derived status. It is not persisted in the database, so a
 * scheduled appointment changes immediately after its start time without a
 * cron job or a page refresh that writes to the database.
 */
export function effectiveAppointmentStatus(
  status?: string | null,
  startsAt?: string | Date | null,
  now = new Date(),
) {
  if (status === "SCHEDULED" && startsAt) {
    const start = startsAt instanceof Date ? startsAt : new Date(startsAt);
    if (!Number.isNaN(start.getTime()) && start.getTime() <= now.getTime()) {
      return "AWAITING";
    }
  }

  return status ?? null;
}

export function appointmentStatusLabel(
  status?: string | null,
  startsAt?: string | Date | null,
  now = new Date(),
) {
  const effectiveStatus = effectiveAppointmentStatus(status, startsAt, now);
  if (!effectiveStatus) return "—";
  return APPOINTMENT_STATUS_LABELS[effectiveStatus] ?? effectiveStatus;
}
