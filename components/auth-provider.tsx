"use client";

import React from "react";
import { disablePushOnThisDevice } from "@/components/push-toggle";
import type { SidebarPermission } from "@/lib/sidebar-permissions";

export type Role = "ADMIN" | "MANAGER" | "RECEPTION" | "SPECIALIST";
export type MeUser = { id: string; login: string; name: string; role: Role; payoutPercent?: number; avatarUrl?: string | null; jobTitle?: string | null; location?: string | null; locationId: string; assignedLocation: { id: string; name: string }; specialization?: string | null; sidebarPermissions: SidebarPermission[]; operatorName?: string | null; impersonatedBy?: { id: string; name: string } | null } | null;

type Ctx = {
  user: MeUser;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  // Konto wspólne: zdejmuje bieżącą osobę — następna podaje swój PIN.
  switchOperator: () => Promise<void>;
  // Administrator: wejście na konto pracownika bez przelogowania i powrót.
  impersonate: (userId: string) => Promise<boolean>;
  stopImpersonation: () => Promise<void>;
};

const AuthContext = React.createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<MeUser>(null);
  const [loading, setLoading] = React.useState(true);

  const refresh = React.useCallback(async () => {
    try {
      const res = await fetch("/api/me", { cache: "no-store" });
      const data = await res.json().catch(() => ({ ok: false }));
      setUser(data?.ok ? data.user : null);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = React.useCallback(async () => {
    // Po wylogowaniu to urządzenie nie powinno już dostawać powiadomień personelu.
    await disablePushOnThisDevice("staff");
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    setUser(null);
    window.location.href = "/login";
  }, []);

  const switchOperator = React.useCallback(async () => {
    await fetch("/api/auth/operator/switch", { method: "POST" }).catch(() => null);
    window.location.href = "/login/pin";
  }, []);

  const impersonate = React.useCallback(async (userId: string) => {
    const res = await fetch("/api/admin/impersonate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || !out?.ok) return false;
    window.location.href = "/";
    return true;
  }, []);

  const stopImpersonation = React.useCallback(async () => {
    await fetch("/api/auth/impersonate/stop", { method: "POST" }).catch(() => null);
    window.location.href = "/admin/users";
  }, []);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <AuthContext.Provider value={{ user, loading, refresh, logout, switchOperator, impersonate, stopImpersonation }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
