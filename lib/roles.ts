// Role personelu. Bez importów serwerowych — używane też w kliencie.
//
// ADMIN   — dostęp do wszystkiego, bez przypisanej lokalizacji (widzi wszystkie).
// MANAGER — dostęp do wszystkiego oprócz logów, ale w obrębie swojej lokalizacji;
//           może zakładać konta niższych ról (recepcja, specjalista).
// RECEPTION, SPECIALIST — jak dotychczas.

export type StaffRole = "ADMIN" | "MANAGER" | "RECEPTION" | "SPECIALIST";

/** Administrator albo kierownik — pełny zakres funkcji (poza logami i kontami wyższych ról). */
export function isAdminLike(role: string | null | undefined): role is "ADMIN" | "MANAGER" {
  return role === "ADMIN" || role === "MANAGER";
}

/** Role, które dana rola może zakładać i zarządzać nimi. */
export function manageableRoles(role: string | null | undefined): StaffRole[] {
  if (role === "ADMIN") return ["ADMIN", "MANAGER", "RECEPTION", "SPECIALIST"];
  if (role === "MANAGER") return ["RECEPTION", "SPECIALIST"];
  return [];
}

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  ADMIN: "Administrator",
  MANAGER: "Manager",
  RECEPTION: "Recepcja",
  SPECIALIST: "Specjalista",
};

/**
 * Czy `actor` może zarządzać kontem `target` (hasło, sesje, dane)? Administrator
 * — każdym; manager — tylko niższymi rolami (recepcja, specjalista) ze swojej
 * lokalizacji.
 */
export function canManageAccount(
  actor: { role: string; locationId: string },
  target: { role: string; locationId: string },
) {
  if (actor.role === "ADMIN") return true;
  if (actor.role === "MANAGER") {
    return manageableRoles("MANAGER").includes(target.role as StaffRole) && target.locationId === actor.locationId;
  }
  return false;
}

/**
 * Wizyta specjalisty: administrator widzi każdą, manager — z własnej
 * lokalizacji, pozostali tylko własne.
 */
export function canAccessSpecialistAppointment(
  user: { id: string; role: string; locationId: string },
  appointment: { specialistId: string; locationId?: string | null },
) {
  if (user.role === "ADMIN") return true;
  if (user.role === "MANAGER") return appointment.locationId === user.locationId;
  return appointment.specialistId === user.id;
}
