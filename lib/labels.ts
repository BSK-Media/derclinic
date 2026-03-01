import { BillingType, Cadence, ProjectStatus } from "@prisma/client";

export function billingLabel(b: BillingType) {
  switch (b) {
    case "HOURLY":
      return "Godzinowo";
    case "FIXED":
      return "Projektowo";
    case "MONTHLY_RETAINER":
      return "Abonament miesięczny";
    default:
      return b;
  }
}

export function cadenceLabel(c: Cadence) {
  switch (c) {
    case "ONE_OFF":
      return "Jednorazowo";
    case "RECURRING_MONTHLY":
      return "Co miesiąc";
    default:
      return c;
  }
}

export function statusLabel(s: ProjectStatus) {
  switch (s) {
    case "ACTIVE":
      return "Aktywny";
    case "PAUSED":
      return "Wstrzymany";
    case "DONE":
      return "Zakończony";
    default:
      return s;
  }
}

export function formatPLN(amount: number) {
  const v = Number.isFinite(amount) ? amount : 0;
  return v.toLocaleString("pl-PL", { style: "currency", currency: "PLN" });
}

export function formatHoursHM(hours: number) {
  const totalMinutes = Math.round((Number.isFinite(hours) ? hours : 0) * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}:${m.toString().padStart(2, "0")}`;
}

export function monthKey(d: Date) {
  return d.toISOString().slice(0, 7);
}
