export const APPOINTMENT_STATUS_LABELS: Record<string, string> = {
  SCHEDULED: "Zaplanowana",
  COMPLETED: "Zakończona",
  CANCELED: "Odwołana",
  NO_SHOW: "Nieobecność pacjenta",
};

export function appointmentStatusLabel(status?: string | null) {
  if (!status) return "—";
  return APPOINTMENT_STATUS_LABELS[status] ?? status;
}
