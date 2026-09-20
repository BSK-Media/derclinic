import { describe, expect, it } from "vitest";
import {
  firstAllowedSidebarHref,
  hasSidebarPermission,
  normalizeSidebarPermissions,
  sidebarHref,
  sidebarPermissionForPath,
} from "./sidebar-permissions";

describe("uprawnienie logs (dziennik zdarzeń) — tylko administrator", () => {
  it("admin ma dostęp", () => {
    expect(hasSidebarPermission("ADMIN", undefined, "logs")).toBe(true);
    expect(normalizeSidebarPermissions("ADMIN", null)).toContain("logs");
  });

  it("recepcja i specjalista nie mają go domyślnie", () => {
    expect(hasSidebarPermission("RECEPTION", null, "logs")).toBe(false);
    expect(hasSidebarPermission("SPECIALIST", null, "logs")).toBe(false);
  });

  it("nie da się go nadać pracownikowi nawet przez zapisane uprawnienia", () => {
    const stored = ["patients", "logs", "appointments"];
    expect(normalizeSidebarPermissions("RECEPTION", stored)).not.toContain("logs");
    expect(hasSidebarPermission("RECEPTION", stored, "logs")).toBe(false);
    expect(hasSidebarPermission("SPECIALIST", stored, "logs")).toBe(false);
    // pozostałe uprawnienia zostają
    expect(normalizeSidebarPermissions("RECEPTION", stored)).toEqual(["appointments", "patients"]);
  });

  it("ścieżki strony i API wymagają uprawnienia logs (middleware blokuje resztę)", () => {
    expect(sidebarPermissionForPath("/admin/logs")).toBe("logs");
    expect(sidebarPermissionForPath("/api/admin/logs")).toBe("logs");
    expect(sidebarPermissionForPath("/api/admin/logs?format=csv")).toBe("logs");
    expect(sidebarHref("logs", "ADMIN")).toBe("/admin/logs");
  });

  it("pracownik bez uprawnienia nie ma logs jako pierwszej strony docelowej", () => {
    expect(firstAllowedSidebarHref("RECEPTION", ["logs"])).toBe("/access-denied");
  });
});
