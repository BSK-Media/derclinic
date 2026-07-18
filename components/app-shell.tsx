"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import React from "react";
import { createPortal } from "react-dom";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/auth-provider";
import { GlobalSearch } from "@/components/global-search";
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

type HeaderNotification = {
  id: string;
  kind: "new" | "changed" | "canceled" | "approved" | "rejected" | "message";
  title: string;
  description: string;
  createdAt: string;
  appointmentId?: string;
  read: boolean;
};

const NAV: NavItem[] = [
  { label: "Dashboard", permission: "dashboard", icon: <span className="text-lg">⌂</span> },
  { label: "Kalendarz", permission: "calendar", icon: <span className="text-lg">🗓️</span> },
  { label: "Wizyty", permission: "appointments", icon: <span className="text-lg">📅</span> },
  { label: "Specjaliści", permission: "specialists", icon: <span className="text-lg">👩‍⚕️</span> },
  { label: "Pacjenci", permission: "patients", icon: <span className="text-lg">👥</span> },
  { label: "Magazyn", permission: "inventory", icon: <span className="text-lg">📦</span> },
  { label: "Produkty", permission: "products", icon: <span className="text-lg">🧴</span> },
  {
    label: "Zabiegi i Procedury",
    permission: "services",
    icon: <span className="text-lg">🩺</span>,
  },
  { label: "Analityka", permission: "analytics", icon: <span className="text-lg">📈</span> },
  { label: "Ustawienia", permission: "settings", icon: <span className="text-lg">⚙️</span> },
];

function UserAvatar({
  name,
  avatarUrl,
  className = "h-8 w-8",
}: {
  name?: string | null;
  avatarUrl?: string | null;
  className?: string;
}) {
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
    <div
      className={cn(
        "inline-flex items-center justify-center rounded-full bg-emerald-100 font-semibold text-emerald-800",
        className,
      )}
    >
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
        <img
          src="/derclinic-logo.webp"
          alt="DerClinic"
          className="h-full w-full object-contain p-1.5"
        />
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-slate-900 dark:text-white">
          DerClinic OS
        </div>
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

function NotificationGlyph({ kind }: { kind: HeaderNotification["kind"] }) {
  const tone =
    kind === "canceled" || kind === "rejected"
      ? "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-300"
      : kind === "approved"
        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
        : kind === "changed"
          ? "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
          : kind === "message"
            ? "bg-violet-100 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300"
            : "bg-sky-100 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300";
  const glyph =
    kind === "canceled" || kind === "rejected"
      ? "×"
      : kind === "approved"
        ? "✓"
        : kind === "changed"
          ? "↻"
          : kind === "message"
            ? "✉"
            : "＋";

  return (
    <span
      className={cn(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-sm font-semibold",
        tone,
      )}
    >
      {glyph}
    </span>
  );
}

export function AppSidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const visibleNav = user
    ? NAV.filter(
        (item) =>
          hasSidebarPermission(user.role, user.sidebarPermissions, item.permission) &&
          // Admin i recepcja mają kalendarz wewnątrz zakładki Wizyty —
          // osobna pozycja "Kalendarz" zostaje tylko dla specjalisty.
          !(item.permission === "calendar" && user.role !== "SPECIALIST"),
      )
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
                    : "text-slate-700 hover:bg-slate-100/70 dark:text-slate-200 dark:hover:bg-white/5",
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

function MobileNav() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [open, setOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  // Zamknij menu po zmianie strony
  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Esc zamyka, blokada scrolla tła gdy otwarte
  React.useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open]);

  const visibleNav = user
    ? NAV.filter(
        (item) =>
          hasSidebarPermission(user.role, user.sidebarPermissions, item.permission) &&
          !(item.permission === "calendar" && user.role !== "SPECIALIST"),
      )
    : [];

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Otwórz menu"
        aria-expanded={open}
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/60 bg-white/70 shadow-sm backdrop-blur transition hover:bg-white dark:border-white/10 dark:bg-[#0b1220]/55 dark:hover:bg-white/10"
      >
        <span className="flex flex-col gap-1">
          <span className="h-0.5 w-5 rounded-full bg-slate-700 dark:bg-slate-200" />
          <span className="h-0.5 w-5 rounded-full bg-slate-700 dark:bg-slate-200" />
          <span className="h-0.5 w-5 rounded-full bg-slate-700 dark:bg-slate-200" />
        </span>
      </button>

      {open && mounted
        ? createPortal(
        <div className="fixed inset-0 z-[100] lg:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
          />
          <div className="absolute bottom-0 left-0 top-0 flex w-[300px] max-w-[85vw] animate-[mobilenav_0.2s_ease-out] flex-col overflow-y-auto border-r border-slate-200 bg-white p-3 shadow-2xl dark:border-white/10 dark:bg-[#0b1220]">
            <style>{`@keyframes mobilenav { from { transform: translateX(-100%); } to { transform: translateX(0); } }`}</style>
            <div className="flex items-center justify-between">
              <LogoBlock />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Zamknij menu"
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl text-xl text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
              >
                ✕
              </button>
            </div>

            <nav className="mt-3 flex-1 space-y-1 overflow-y-auto px-1">
              {visibleNav.map((item) => {
                const href = sidebarHref(item.permission, user!.role);
                const active =
                  pathname === href ||
                  (href !== "/admin" && href !== "/specialist" && pathname.startsWith(href));

                return (
                  <Link
                    key={item.permission}
                    href={href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition",
                      active
                        ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-200"
                        : "text-slate-700 hover:bg-slate-100/70 dark:text-slate-200 dark:hover:bg-white/5",
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
        </div>,
        document.body,
      )
      : null}
    </div>
  );
}

export function AppHeader() {
  const { user } = useAuth();
  const { isDark, toggle } = useThemeToggle();
  const [notificationsOpen, setNotificationsOpen] = React.useState(false);
  const [notificationsLoading, setNotificationsLoading] = React.useState(false);
  const [notifications, setNotifications] = React.useState<HeaderNotification[]>([]);
  const notificationsRef = React.useRef<HTMLDivElement>(null);
  const profileHref = user?.role === "SPECIALIST" ? "/specialist" : "/admin/profile";
  const unreadCount = notifications.filter((notification) => !notification.read).length;

  const loadNotifications = React.useCallback(async () => {
    if (!user?.id) {
      setNotifications([]);
      return;
    }
    setNotificationsLoading(true);
    try {
      const response = await fetch("/api/notifications", { cache: "no-store" });
      const result = await response.json().catch(() => ({}));
      if (response.ok && result?.ok) setNotifications(result.notifications ?? []);
    } finally {
      setNotificationsLoading(false);
    }
  }, [user?.id]);

  React.useEffect(() => {
    loadNotifications();
    const timer = window.setInterval(loadNotifications, 30_000);
    return () => window.clearInterval(timer);
  }, [loadNotifications]);

  React.useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, []);

  async function toggleNotificationRead(notificationId: string, nextRead: boolean) {
    const previous = notifications;
    setNotifications((current) =>
      current.map((notification) =>
        notification.id === notificationId ? { ...notification, read: nextRead } : notification,
      ),
    );
    const response = await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ notificationId, read: nextRead }),
    });
    if (!response.ok) setNotifications(previous);
  }

  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/60 bg-white/70 px-4 py-3 backdrop-blur dark:border-white/10 dark:bg-[#0b1220]/55 lg:px-6">
      <div className="flex items-center gap-3 lg:gap-4">
        <MobileNav />
        <GlobalSearch />

        <div className="flex items-center gap-3">
          <div ref={notificationsRef} className="relative">
            <button
              type="button"
              onClick={() => {
                setNotificationsOpen((current) => !current);
                loadNotifications();
              }}
              className="relative inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/60 bg-white/70 shadow-sm backdrop-blur transition hover:bg-white dark:border-white/10 dark:bg-[#0b1220]/55 dark:hover:bg-white/10"
              aria-label="Powiadomienia"
              aria-expanded={notificationsOpen}
            >
              <span className="text-slate-700 dark:text-slate-200">🔔</span>
              {unreadCount > 0 ? (
                <span className="absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-[#0b1220]" />
              ) : null}
            </button>

            {notificationsOpen ? (
              <div className="absolute right-0 top-[calc(100%+10px)] z-50 w-[min(390px,calc(100vw-32px))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-white/10 dark:bg-[#0b1220]">
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-white/10">
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-white">
                      Powiadomienia
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {unreadCount > 0
                        ? `${unreadCount} nieprzeczytane`
                        : "Wszystkie powiadomienia przeczytane"}
                    </div>
                  </div>
                </div>

                <div className="max-h-[420px] overflow-y-auto">
                  {notificationsLoading && notifications.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-slate-500">Ładowanie…</div>
                  ) : null}
                  {!notificationsLoading && notifications.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-slate-500">
                      Brak powiadomień.
                    </div>
                  ) : null}
                  {notifications.map((notification) => {
                    const content = (
                      <>
                        <NotificationGlyph kind={notification.kind} />
                        <div className="min-w-0 flex-1">
                          <div
                            className={cn(
                              "truncate text-sm text-slate-900 dark:text-white",
                              notification.read ? "font-medium" : "font-semibold",
                            )}
                          >
                            {notification.title}
                          </div>
                          <div className="mt-0.5 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
                            {notification.description}
                          </div>
                          <div className="mt-1 text-[11px] text-slate-400">
                            {new Date(notification.createdAt).toLocaleString("pl-PL", {
                              day: "2-digit",
                              month: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>
                        </div>
                      </>
                    );

                    return (
                      <div
                        key={notification.id}
                        className={cn(
                          "flex items-start gap-2 border-b border-slate-100 p-3 last:border-b-0 dark:border-white/10",
                          notification.read
                            ? "bg-white dark:bg-[#0b1220]"
                            : "bg-emerald-50/60 dark:bg-emerald-500/5",
                        )}
                      >
                        {notification.appointmentId ? (
                          <Link
                            href={`/specialist/appointments/${notification.appointmentId}`}
                            onClick={() => setNotificationsOpen(false)}
                            className="flex min-w-0 flex-1 items-start gap-3 rounded-xl p-1 transition hover:bg-slate-50 dark:hover:bg-white/5"
                          >
                            {content}
                          </Link>
                        ) : (
                          <div className="flex min-w-0 flex-1 items-start gap-3 p-1">{content}</div>
                        )}
                        <button
                          type="button"
                          onClick={() => toggleNotificationRead(notification.id, !notification.read)}
                          className={cn(
                            "mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border text-sm font-bold transition",
                            notification.read
                              ? "border-emerald-200 bg-emerald-50 text-emerald-600 hover:border-slate-300 hover:bg-white hover:text-slate-500 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:hover:bg-white/5 dark:hover:text-slate-300"
                              : "border-slate-200 bg-white text-slate-500 hover:border-emerald-300 hover:text-emerald-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300",
                          )}
                          aria-label={
                            notification.read
                              ? "Oznacz jako nieprzeczytane"
                              : "Oznacz jako przeczytane"
                          }
                          title={
                            notification.read
                              ? "Oznacz jako nieprzeczytane"
                              : "Oznacz jako przeczytane"
                          }
                        >
                          ✓
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>

          <Link
            href={profileHref}
            className="hidden items-center gap-3 rounded-2xl border border-white/60 bg-white/70 px-3 py-2 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#0b1220]/55 sm:flex"
            aria-label="Open profile"
          >
            <UserAvatar name={user?.name} avatarUrl={user?.avatarUrl} className="h-8 w-8" />
            <div>
              <div className="text-sm font-medium text-slate-700 dark:text-slate-200">
                {user?.name ?? "Użytkownik"}
              </div>
              {user?.jobTitle ? (
                <div className="text-xs text-slate-400">{user.jobTitle}</div>
              ) : null}
            </div>
            <span className="text-slate-400">▾</span>
          </Link>

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
