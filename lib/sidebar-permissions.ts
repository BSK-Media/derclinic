export const SIDEBAR_PERMISSION_KEYS = [
  "dashboard",
  "appointments",
  "specialists",
  "patients",
  "inventory",
  "products",
  "services",
  "analytics",
  "settings",
] as const;

export type SidebarPermission = (typeof SIDEBAR_PERMISSION_KEYS)[number];

export const SIDEBAR_PERMISSION_OPTIONS: ReadonlyArray<{
  key: SidebarPermission;
  label: string;
}> = [
  { key: "dashboard", label: "Dashboard" },
  { key: "appointments", label: "Wizyty" },
  { key: "specialists", label: "Specjaliści" },
  { key: "patients", label: "Pacjenci" },
  { key: "inventory", label: "Magazyn" },
  { key: "products", label: "Produkty" },
  { key: "services", label: "Zabiegi i Procedury" },
  { key: "analytics", label: "Analityka" },
  { key: "settings", label: "Ustawienia" },
];

const ALL_PERMISSIONS = [...SIDEBAR_PERMISSION_KEYS];

// Dotychczasowy zakres menu dla pracowników, z wyłączeniem sekcji zastrzeżonych
// domyślnie dla administratora.
const DEFAULT_NON_ADMIN_PERMISSIONS: SidebarPermission[] = SIDEBAR_PERMISSION_KEYS.filter(
  (key) => key !== "analytics" && key !== "specialists",
);

export function normalizeSidebarPermissions(role: string, value: unknown): SidebarPermission[] {
  if (role === "ADMIN") return [...ALL_PERMISSIONS];

  if (!Array.isArray(value)) return [...DEFAULT_NON_ADMIN_PERMISSIONS];

  const allowed = new Set<SidebarPermission>(SIDEBAR_PERMISSION_KEYS);
  return SIDEBAR_PERMISSION_KEYS.filter((key) => value.includes(key) && allowed.has(key));
}

export function hasSidebarPermission(
  role: string,
  permissions: unknown,
  permission: SidebarPermission,
) {
  return normalizeSidebarPermissions(role, permissions).includes(permission);
}

export function sidebarPermissionForPath(pathname: string): SidebarPermission | null {
  const path = pathname.split("?")[0];

  if (path === "/specialist") return "dashboard";
  if (path.startsWith("/specialist/appointments") || path.startsWith("/specialist/schedule")) {
    return "appointments";
  }

  if (path === "/api/dashboard") return "dashboard";
  if (path.startsWith("/api/specialist/appointments")) return "appointments";

  if (path.startsWith("/admin/specialists") || path.startsWith("/api/admin/specialists")) {
    return "specialists";
  }
  if (
    path.startsWith("/admin/appointments") ||
    path.startsWith("/admin/visits") ||
    path.startsWith("/api/admin/appointments")
  ) {
    return "appointments";
  }
  if (
    path.startsWith("/admin/patients") ||
    path.startsWith("/admin/new-patients") ||
    path.startsWith("/api/admin/patients")
  ) {
    return "patients";
  }
  if (
    path.startsWith("/admin/inventory") ||
    path.startsWith("/admin/warehouses") ||
    path.startsWith("/admin/supplies") ||
    path.startsWith("/api/admin/inventory") ||
    path.startsWith("/api/admin/warehouses") ||
    path.startsWith("/api/admin/stocks")
  ) {
    return "inventory";
  }
  if (path.startsWith("/admin/products") || path.startsWith("/api/admin/products")) {
    return "products";
  }
  if (
    path.startsWith("/admin/services") ||
    path.startsWith("/admin/procedures") ||
    path.startsWith("/admin/clinic-treatments") ||
    path.startsWith("/api/admin/services")
  ) {
    return "services";
  }
  if (
    path.startsWith("/admin/analytics") ||
    path.startsWith("/admin/revenue") ||
    path.startsWith("/admin/sales") ||
    path.startsWith("/admin/settlements") ||
    path.startsWith("/api/admin/sales") ||
    path.startsWith("/api/admin/settlements")
  ) {
    return "analytics";
  }
  if (path.startsWith("/admin/settings") || path.startsWith("/admin/profile")) {
    return "settings";
  }
  if (path === "/admin") return "dashboard";

  return null;
}

export function sidebarHref(permission: SidebarPermission, role: string) {
  if (permission === "dashboard") return role === "SPECIALIST" ? "/specialist" : "/admin";
  if (permission === "appointments") {
    return role === "ADMIN" ? "/admin/visits" : "/specialist/appointments";
  }

  const hrefs: Record<Exclude<SidebarPermission, "dashboard" | "appointments">, string> = {
    specialists: "/admin/specialists",
    patients: "/admin/patients",
    inventory: "/admin/inventory",
    products: "/admin/products",
    services: "/admin/services",
    analytics: "/admin/analytics",
    settings: "/admin/settings",
  };

  return hrefs[permission];
}

export function firstAllowedSidebarHref(role: string, permissions: unknown) {
  const first = normalizeSidebarPermissions(role, permissions)[0];
  return first ? sidebarHref(first, role) : "/access-denied";
}
