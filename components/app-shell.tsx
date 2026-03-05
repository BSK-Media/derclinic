"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bell,
  Boxes,
  CalendarDays,
  ChevronDown,
  LayoutDashboard,
  Package,
  Settings,
  Stethoscope,
  Users,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";

const NAV = [
  { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { label: "Wizyty", href: "/admin/visits", icon: CalendarDays },
  { label: "Specjaliści", href: "/admin/specialists", icon: Stethoscope },
  { label: "Pacjenci", href: "/admin/patients", icon: Users },
  { label: "Magazyn", href: "/admin/inventory", icon: Boxes },
  { label: "Produkty", href: "/admin/products", icon: Package },
  { label: "Analityka", href: "/admin/analytics", icon: BarChart3 },
  { label: "Ustawienia", href: "/admin/settings", icon: Settings },
];

function AppHeader() {
  return (
    <header className="fixed top-0 z-40 h-16 w-full bg-gradient-to-b from-[#eef3f7]/95 to-[#f7fbff]/80 backdrop-blur dark:from-[#070b13]/95 dark:to-[#0b1220]/80">
      <div className="flex h-full items-center gap-4 px-6 lg:pl-[18rem]">
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
            <Bell className="h-5 w-5 text-slate-600 dark:text-slate-200" />
            <span className="absolute right-3 top-3 h-2 w-2 rounded-full bg-red-500" />
          </button>

          <div className="hidden items-center gap-3 rounded-2xl border border-white/60 bg-white/70 px-3 py-2 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#0b1220]/55 sm:flex">
            <div className="relative h-8 w-8 overflow-hidden rounded-full bg-slate-200">
              <img
                src="/demo-avatar-ewa.svg"
                alt="Dr. Ewa Kowalska"
                className="h-full w-full object-cover"
              />
            </div>
            <div className="leading-tight">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Dr. Ewa Kowalska
              </div>
            </div>
            <ChevronDown className="h-4 w-4 text-slate-400" />
          </div>

          <button
            type="button"
            className="hidden h-11 items-center gap-2 rounded-2xl border border-white/60 bg-white/70 px-3 text-sm font-medium text-slate-700 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#0b1220]/55 dark:text-slate-200 sm:flex"
          >
            EN <ChevronDown className="h-4 w-4 opacity-60" />
          </button>

          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#eef3f7] via-[#eef3f7] to-[#f7fbff] text-slate-900 dark:from-[#070b13] dark:via-[#070b13] dark:to-[#0b1220] dark:text-white">
      {/* Sidebar fixed to the left edge */}
      <aside className="fixed inset-y-0 left-0 z-50 hidden w-72 p-5 lg:block">
        <div className="h-full rounded-3xl border border-white/60 bg-white/80 p-5 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#0b1220]/55">
          <div className="flex items-start gap-3">
            <div className="relative h-11 w-11 overflow-hidden rounded-2xl bg-white shadow-sm">
              <img
                src="/derclinic-logo.webp"
                alt="DerClinic"
                className="h-full w-full object-contain"
              />
            </div>
            <div>
              <div className="text-base font-semibold">DerClinic OS</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Administrator • ADMIN
              </div>
            </div>
          </div>

          <nav className="mt-5 space-y-1">
            {NAV.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl px-4 py-2.5 text-sm font-medium transition",
                    active
                      ? "bg-[#dff3f2] text-[#0c6b6b]"
                      : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10"
                  )}
                >
                  <Icon
                    className={cn(
                      "h-4 w-4",
                      active
                        ? "text-[#0c6b6b]"
                        : "text-slate-500 dark:text-slate-300"
                    )}
                  />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-6">
            <button
              type="button"
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            >
              Wyloguj
            </button>
          </div>
        </div>
      </aside>

      {/* Header fixed to the top edge (shared across tabs) */}
      <AppHeader />

      {/* Main content fills full width; leaves room for fixed header/sidebar */}
      <div className="pt-16 lg:pl-72">
        <main className="min-h-[calc(100vh-4rem)] px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
