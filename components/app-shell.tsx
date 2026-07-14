"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import React from "react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/auth-provider";
import {
  firstAllowedSidebarHref,
  hasSidebarPermission,
  sidebarHref,
  sidebarPermissionForPath,
  type SidebarPermission,
} from "@/lib/sidebar-permissions";

function useThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === "dark";
  const toggle = () => setTheme(isDark ? "light" : "dark");
  return { isDark, toggle };
}

type NavItem = {
  label: string;
  permission: SidebarPermission;
  icon: React.ReactNode;
};

const NAV: NavItem[] = [
  { label: "Dashboard", permission: "dashboard", icon: <span className="text-lg">⌂</span> },
  { label: "Kalendarz", permission: "calendar", icon: <span className="text-lg">🗓️</span> },
  { label: "Wizyty", permission: "appointments", icon: <span className="text-lg">📅</span> },
  { label: "Specjaliści", permission: "specialists", icon: <span className="text-lg">👩‍⚕️</span> },
  { label: "Pacjenci", permission: "patients", icon: <span className="text-lg">👥</span> },
  { label: "Magazyn", permission: "inventory", icon: <span className="text-lg">📦</span> },
  { label: "Produkty", permission: "products", icon: <span className="text-lg">🧴</span> },
  { label: "Zabiegi i Procedury", permission: "services", icon: <span className="text-lg">🩺</span> },
  { label: "Analityka", permission: "analytics", icon: <span className="text-lg">📈</span> },
  { label: "Ustawienia", permission: "settings", icon: <span className="text-lg">⚙️</span> },
];

function UserAvatar({ name, avatarUrl, className = "h-8 w-8" }: { name?: string | null; avatarUrl?: string | null; className?: string }) {
  const initials = (name ?? "U")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  if (avatarUrl) {
    return (
      <div className={cn("relative overflow-hidden rounded-full bg-slate-200", className)}>
        <img src={avatarUrl} alt={name ?? "Użytkownik"} className="h-full w-full object-cover" />
      </div>
    );
  }

  return (
    <div className={cn("inline-flex items-center justify-center rounded-full bg-emerald-100 font-semibold text-emerald-800", className)}>
      {initials || "U"}
    </div>
  );
}

function LogoBlock() {
  const { user } = useAuth();
  const { isDark, toggle } = useThemeToggle();

  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <div className="relative h-11 w-11 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5 dark:ring-white/10">
        <img src="/derclinic-logo.webp" alt="DerClinic" className="h-full w-full object-contain p-1.5" />
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-slate-900 dark:text-white">DerClinic OS</div>
        <div className="truncate text-xs text-slate-500 dark:text-slate-400">
          {user?.name ?? "Użytkownik"} • {user?.role ?? "—"}
        </div>
      </div>
      <button
        type="button"
        onClick={toggle}
        aria-label={isDark ? "Przełącz na jasny motyw" : "Przełącz na ciemny motyw"}
        className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-white/60 bg-white/70 shadow-sm backdrop-blur transition hover:bg-white dark:border-white/10 dark:bg-[#0b1220]/55 dark:hover:bg-white/10"
      >
        <span className="text-slate-700 dark:text-slate-200">{isDark ? "☀" : "☾"}</span>
      </button>
    </div>
  );
}

export function AppSidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const visibleNav = user
    ? NAV.filter((item) => hasSidebarPermission(user.role, user.sidebarPermissions, item.permission))
    : [];

  return (
    <aside className="fixed left-0 top-0 z-50 hidden h-screen w-[280px] shrink-0 border-r border-white/70 bg-white/65 p-3 backdrop-blur dark:border-white/10 dark:bg-[#0b1220]/45 lg:block">
      <div className="flex h-full flex-col">
        <LogoBlock />

        <nav className="mt-3 flex-1 space-y-1 px-1">
          {visibleNav.map((item) => {
            const href = sidebarHref(item.permission, user!.role);
            const active =
              pathname === href ||
              (href !== "/admin" && href !== "/specialist" && pathname.startsWith(href));

            return (
              <Link
                key={item.permission}
                href={href}
                className={cn(
                  "flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition",
                  active
                    ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-200"
                    : "text-slate-700 hover:bg-slate-100/70 dark:text-slate-200 dark:hover:bg-white/5"
                )}
              >
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/70 shadow-sm ring-1 ring-black/5 dark:bg-white/5 dark:ring-white/10">
                  {item.icon}
                </span>
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-2 rounded-2xl border border-white/60 bg-white/70 p-3 shadow-sm dark:border-white/10 dark:bg-[#0b1220]/55">
          <button
            onClick={() => logout()}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
          >
            Wyloguj
          </button>
        </div>
      </div>
    </aside>
  );
}

export function AppHeader() {
  const { user } = useAuth();
  const { isDark, toggle } = useThemeToggle();
  const profileHref = user?.role === "SPECIALIST" ? "/specialist" : "/admin/profile";

  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/60 bg-white/70 px-4 py-3 backdrop-blur dark:border-white/10 dark:bg-[#0b1220]/55 lg:px-6">
      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <div className="flex h-11 items-center gap-3 rounded-2xl border border-white/60 bg-white/70 px-4 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#0b1220]/55">
            <span className="text-slate-400 dark:text-slate-500">⌕</span>
            <input
              aria-label="Search"
              placeholder="Search..."
              className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400 dark:placeholder:text-slate-500"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            className="relative inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/60 bg-white/70 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#0b1220]/55"
            aria-label="Notifications"
          >
            <span className="text-slate-700 dark:text-slate-200">🔔</span>
            <span className="absolute right-3 top-3 h-2 w-2 rounded-full bg-red-500" />
          </button>

          <Link
            href={profileHref}
            className="hidden items-center gap-3 rounded-2xl border border-white/60 bg-white/70 px-3 py-2 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#0b1220]/55 sm:flex"
            aria-label="Open profile"
          >
            <UserAvatar name={user?.name} avatarUrl={user?.avatarUrl} className="h-8 w-8" />
            <div>
              <div className="text-sm font-medium text-slate-700 dark:text-slate-200">{user?.name ?? "Użytkownik"}</div>
              {user?.jobTitle ? <div className="text-xs text-slate-400">{user.jobTitle}</div> : null}
            </div>
            <span className="text-slate-400">▾</span>
          </Link>

          <button className="inline-flex h-11 items-center gap-2 rounded-2xl border border-white/60 bg-white/70 px-4 text-sm font-semibold text-slate-700 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#0b1220]/55 dark:text-slate-200">
            EN <span className="text-slate-400">▾</span>
          </button>

          <button
            type="button"
            onClick={toggle}
            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/60 bg-white/70 shadow-sm backdrop-blur transition hover:bg-white dark:border-white/10 dark:bg-[#0b1220]/55 dark:hover:bg-white/10"
            aria-label={isDark ? "Przełącz na jasny motyw" : "Przełącz na ciemny motyw"}
          >
            <span className="text-slate-700 dark:text-slate-200">{isDark ? "☀" : "◐"}</span>
          </button>
        </div>
      </div>
    </header>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useAuth();
  const requiredPermission = sidebarPermissionForPath(pathname);
  const hasAccess =
    !requiredPermission ||
    (!!user && hasSidebarPermission(user.role, user.sidebarPermissions, requiredPermission));

  React.useEffect(() => {
    if (loading || !user || hasAccess) return;
    router.replace(firstAllowedSidebarHref(user.role, user.sidebarPermissions));
  }, [hasAccess, loading, router, user]);

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-[#eef3f7] via-[#eef3f7] to-[#f7fbff] text-slate-900 dark:from-[#070b13] dark:via-[#070b13] dark:to-[#0b1220] dark:text-white">
      <AppSidebar />
      <div className="flex min-h-screen w-full flex-col lg:pl-[280px]">
        <AppHeader />
        <main className="flex-1 px-4 py-6 lg:px-6">
          {!loading && hasAccess ? children : null}
          {!loading && user && !hasAccess ? (
            <div className="rounded-3xl border border-white/60 bg-white/80 p-6 text-sm text-slate-600 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#0b1220]/55 dark:text-slate-300">
              Przekierowanie do dostępnej sekcji…
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
}
