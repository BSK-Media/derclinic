"use client";

import React from "react";

export type Role = "ADMIN" | "RECEPTION" | "SPECIALIST";
export type MeUser = { id: string; login: string; name: string; role: Role; payoutPercent?: number } | null;

type Ctx = {
  user: MeUser;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
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
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    setUser(null);
    window.location.href = "/login";
  }, []);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  return <AuthContext.Provider value={{ user, loading, refresh, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
