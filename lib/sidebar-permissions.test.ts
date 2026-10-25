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
    expect(normalizeSidebarPermissions("RECEPTION", stored)).toEqual(["today", "appointments", "patients", "chat", "vouchers", "packages"]);
  });

  it("ścieżki strony i API wymagają uprawnienia logs (middleware blokuje resztę)", () => {
    expect(sidebarPermissionForPath("/admin/logs")).toBe("logs");
    expect(sidebarPermissionForPath("/api/admin/logs")).toBe("logs");
    expect(sidebarPermissionForPath("/api/admin/logs?format=csv")).toBe("logs");
    expect(sidebarHref("logs", "ADMIN")).toBe("/admin/logs");
  });

  it("pracownik bez uprawnienia nie ma logs jako pierwszej strony docelowej", () => {
    // Zostaje tylko czat (dostępny dla każdego pracownika), a nie dziennik zdarzeń.
    expect(firstAllowedSidebarHref("RECEPTION", ["logs"])).toBe("/chat");
  });
});

describe("vouchery i pakiety — administrator, manager i recepcja", () => {
  it("recepcja ma je zawsze, specjalista nie", () => {
    for (const permission of ["vouchers", "packages"] as const) {
      expect(hasSidebarPermission("ADMIN", null, permission)).toBe(true);
      expect(hasSidebarPermission("MANAGER", null, permission)).toBe(true);
      expect(hasSidebarPermission("RECEPTION", ["patients"], permission)).toBe(true);
      expect(hasSidebarPermission("SPECIALIST", null, permission)).toBe(false);
    }
    expect(sidebarPermissionForPath("/admin/vouchers")).toBe("vouchers");
    expect(sidebarPermissionForPath("/api/admin/packages/templates")).toBe("packages");
    expect(sidebarHref("vouchers", "RECEPTION")).toBe("/admin/vouchers");
  });
});

describe("czat wewnętrzny — dla każdego pracownika", () => {
  it("każda rola ma czat, także gdy zapisane uprawnienia go nie zawierają", () => {
    for (const role of ["ADMIN", "MANAGER", "RECEPTION", "SPECIALIST"]) {
      expect(hasSidebarPermission(role, null, "chat")).toBe(true);
      expect(hasSidebarPermission(role, ["patients"], "chat")).toBe(true);
    }
  });
  it("ścieżki strony i API czatu wymagają uprawnienia chat", () => {
    expect(sidebarPermissionForPath("/chat")).toBe("chat");
    expect(sidebarPermissionForPath("/api/chat/messages")).toBe("chat");
    expect(sidebarHref("chat", "SPECIALIST")).toBe("/chat");
    expect(sidebarHref("chat", "RECEPTION")).toBe("/chat");
  });
});

describe("uprawnienia push i email (powiadomienia, poczta) — tylko administrator", () => {
  it("admin ma dostęp, pracownicy nie — także przez zapisane uprawnienia", () => {
    for (const permission of ["push", "email"] as const) {
      expect(hasSidebarPermission("ADMIN", undefined, permission)).toBe(true);
      expect(hasSidebarPermission("RECEPTION", null, permission)).toBe(false);
      expect(hasSidebarPermission("SPECIALIST", null, permission)).toBe(false);
      expect(hasSidebarPermission("RECEPTION", ["settings", permission], permission)).toBe(false);
    }
  });

  it("ścieżki stron i API są przypisane do właściwych sekcji", () => {
    expect(sidebarPermissionForPath("/admin/push")).toBe("push");
    expect(sidebarPermissionForPath("/api/admin/push/send")).toBe("push");
    expect(sidebarPermissionForPath("/admin/email")).toBe("email");
    expect(sidebarPermissionForPath("/api/admin/email/test")).toBe("email");
    expect(sidebarHref("push", "ADMIN")).toBe("/admin/push");
    expect(sidebarHref("email", "ADMIN")).toBe("/admin/email");
  });

  it("ustawienia zostają dostępne dla pracowników", () => {
    expect(hasSidebarPermission("RECEPTION", null, "settings")).toBe(true);
    expect(sidebarPermissionForPath("/admin/settings")).toBe("settings");
  });
});

describe("rola MANAGER — wszystko oprócz logów", () => {
  it("ma wszystkie sekcje poza logs, niezależnie od zapisanych uprawnień", () => {
    const perms = normalizeSidebarPermissions("MANAGER", ["patients"]);
    expect(perms).not.toContain("logs");
    for (const key of ["dashboard", "analytics", "pos", "locations", "settings", "push", "email", "loyalty"] as const) {
      expect(perms).toContain(key);
    }
    expect(hasSidebarPermission("MANAGER", null, "logs")).toBe(false);
    expect(hasSidebarPermission("MANAGER", null, "analytics")).toBe(true);
  });

  it("pierwsza dostępna strona to panel administracyjny", () => {
    expect(firstAllowedSidebarHref("MANAGER", null)).toBe("/admin");
  });
});

describe("Wizyty dziś", () => {
  it("jest dostępne razem z Wizytami i prowadzi do właściwej strony", () => {
    expect(normalizeSidebarPermissions("SPECIALIST", ["appointments"])).toContain("today");
    expect(normalizeSidebarPermissions("SPECIALIST", ["patients"])).not.toContain("today");
    expect(sidebarHref("today", "SPECIALIST")).toBe("/specialist/today");
    expect(sidebarHref("today", "RECEPTION")).toBe("/admin/today");
    expect(sidebarPermissionForPath("/admin/today")).toBe("today");
    expect(sidebarPermissionForPath("/specialist/today")).toBe("today");
  });
});
