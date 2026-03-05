"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";
import { cn } from "@/lib/utils";

type NavItem = {
  label: string;
  href: string;
  icon: React.ReactNode;
};

const NAV: NavItem[] = [
  { label: "Dashboard", href: "/admin", icon: <span className="text-lg">⌂</span> },
  { label: "Wizyty", href: "/admin/visits", icon: <span className="text-lg">📅</span> },
  { label: "Specjaliści", href: "/admin/specialists", icon: <span className="text-lg">👩‍⚕️</span> },
  { label: "Pacjenci", href: "/admin/patients", icon: <span className="text-lg">👥</span> },
  { label: "Magazyn", href: "/admin/inventory", icon: <span className="text-lg">📦</span> },
  { label: "Produkty", href: "/admin/products", icon: <span className="text-lg">🧴</span> },
  { label: "Analityka", href: "/admin/analytics", icon: <span className="text-lg">📈</span> },
  { label: "Ustawienia", href: "/admin/settings", icon: <span className="text-lg">⚙️</span> },
];

function LogoBlock() {
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <div className="relative h-11 w-11 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5 dark:bg-[#0b1220]/55 dark:ring-white/10">
        <img src="/derclinic-logo.webp" alt="DerClinic" className="h-full w-full object-contain p-1.5" />
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-slate-900 dark:text-white">DerClinic OS</div>
        <div className="truncate text-xs text-slate-500 dark:text-slate-400">Administrator • ADMIN</div>
      </div>
      <div className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-white/60 bg-white/70 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#0b1220]/55">
        <span className="text-slate-700 dark:text-slate-200">☾</span>
      </div>
    </div>
  );
}

export function AppSidebar() {
  const pathname = usePathname();
  return (
    <aside className="fixed left-0 top-0 z-50 hidden h-screen w-[280px] shrink-0 border-r border-white/70 bg-white/65 p-3 backdrop-blur dark:border-white/10 dark:bg-[#0b1220]/45 lg:block">
      <div className="flex h-full flex-col">
        <LogoBlock />

        <nav className="mt-3 flex-1 space-y-1 px-1">
          {NAV.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== "/admin" && pathname.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
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
          <button className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10">
            Wyloguj
          </button>
        </div>
      </div>
    </aside>
  );
}

export function AppHeader() {
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
            href="/admin/profile"
            className="hidden items-center gap-3 rounded-2xl border border-white/60 bg-white/70 px-3 py-2 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#0b1220]/55 sm:flex"
            aria-label="Open profile"
          >
            <div className="relative h-8 w-8 overflow-hidden rounded-full bg-slate-200">
              <img src="/demo-avatar-ewa.svg" alt="Dr. Ewa Kowalska" className="h-full w-full object-cover" />
            </div>
            <div className="text-sm font-medium text-slate-700 dark:text-slate-200">Dr. Ewa Kowalska</div>
            <span className="text-slate-400">▾</span>
          </Link>

          <button className="inline-flex h-11 items-center gap-2 rounded-2xl border border-white/60 bg-white/70 px-4 text-sm font-semibold text-slate-700 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#0b1220]/55 dark:text-slate-200">
            EN <span className="text-slate-400">▾</span>
          </button>

          <button
            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/60 bg-white/70 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#0b1220]/55"
            aria-label="Toggle theme"
          >
            <span className="text-slate-700 dark:text-slate-200">◐</span>
          </button>
        </div>
      </div>
    </header>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-[#eef3f7] via-[#eef3f7] to-[#f7fbff] text-slate-900 dark:from-[#070b13] dark:via-[#070b13] dark:to-[#0b1220] dark:text-white">
      <AppSidebar />
      <div className="flex min-h-screen w-full flex-col lg:pl-[280px]">
        <AppHeader />
        <main className="flex-1 px-4 py-6 lg:px-6">{children}</main>
      </div>
    </div>
  );
}
