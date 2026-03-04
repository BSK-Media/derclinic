"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Bell,
  ChevronDown,
  Home,
  CalendarDays,
  Wallet,
  Stethoscope,
  Users,
  Package,
  AlertTriangle,
  Warehouse,
  ClipboardList,
  Search,
  LogOut,
} from "lucide-react";

type NavItem = { href: string; label: string; icon: React.ReactNode };

function NavLink({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const active = pathname === item.href || pathname.startsWith(item.href + "/");
  return (
    <Link
      href={item.href}
      className={[
        "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition",
        active
          ? "bg-teal-100 text-teal-900 dark:bg-teal-950/40 dark:text-teal-100"
          : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-900",
      ].join(" ")}
    >
      <span className="text-zinc-500 dark:text-zinc-300">{item.icon}</span>
      <span className="font-medium">{item.label}</span>
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();

  if (loading) return <div className="p-6 text-sm text-zinc-500">Ładowanie…</div>;
  if (!user) return <div className="p-6 text-sm text-zinc-500">Brak sesji.</div>;

  const isAdmin = user.role === "ADMIN" || user.role === "RECEPTION";

  const adminNav: NavItem[] = [
    { href: "/admin", label: "Dashboard", icon: <Home className="h-4 w-4" /> },
    { href: "/admin/appointments", label: "Wizyty", icon: <CalendarDays className="h-4 w-4" /> },
    { href: "/admin/settlements", label: "Przychód", icon: <Wallet className="h-4 w-4" /> },
    { href: "/admin/services", label: "Zabiegów Klinika", icon: <Stethoscope className="h-4 w-4" /> },
    { href: "/admin/patients", label: "Nowi Pacjenci", icon: <Users className="h-4 w-4" /> },
    { href: "/admin/sales", label: "Drofilia", icon: <ClipboardList className="h-4 w-4" /> },
    { href: "/admin/warehouses", label: "Magazyn - Alerty", icon: <AlertTriangle className="h-4 w-4" /> },
    { href: "/admin/products", label: "Magazyn preparatów", icon: <Package className="h-4 w-4" /> },
    { href: "/admin/users", label: "Wapozylanie", icon: <Warehouse className="h-4 w-4" /> },
  ];

  const specialistNav: NavItem[] = [
    { href: "/specialist", label: "Dashboard", icon: <Home className="h-4 w-4" /> },
    { href: "/specialist/appointments", label: "Wizyty", icon: <CalendarDays className="h-4 w-4" /> },
    { href: "/specialist/schedule", label: "Grafik", icon: <ClipboardList className="h-4 w-4" /> },
  ];

  const nav = isAdmin ? adminNav : specialistNav;

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <div className="flex">
        <aside className="w-[260px] shrink-0 border-r bg-white px-4 py-5 dark:bg-zinc-950">
          <div className="flex items-center gap-3 px-2">
            <div className="h-10 w-10 overflow-hidden rounded-xl bg-teal-100 dark:bg-teal-950/40">
              <Image src="/derclinic-logo.webp" alt="DerClinic" width={40} height={40} className="h-10 w-10 object-contain" />
            </div>
            <div className="leading-tight">
              <div className="text-lg font-semibold">Estetika</div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">Clinique</div>
            </div>
          </div>

          <nav className="mt-6 space-y-1">
            {nav.map((item) => (
              <NavLink key={item.href} item={item} />
            ))}
            {user.role === "ADMIN" && (
              <div className="pt-2">
                <Link
                  href="/specialist"
                  className="block rounded-xl px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
                >
                  Podgląd: specjalista
                </Link>
              </div>
            )}
          </nav>

          <div className="mt-6 flex items-center justify-between rounded-xl border bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:bg-zinc-900/40 dark:text-zinc-300">
            <span>Zalogowano</span>
            <span className="font-medium">{user.name}</span>
          </div>

          <Button variant="outline" className="mt-3 w-full" onClick={logout}>
            <LogOut className="mr-2 h-4 w-4" /> Wyloguj
          </Button>
        </aside>

        <div className="min-w-0 flex-1">
          <div className="sticky top-0 z-20 border-b bg-white/80 backdrop-blur dark:bg-zinc-950/80">
            <div className="mx-auto flex max-w-[1280px] items-center gap-4 px-6 py-3">
              <div className="relative w-full max-w-[420px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                <Input placeholder="Search..." className="h-10 pl-9 bg-zinc-50 dark:bg-zinc-900/40" />
              </div>
              <div className="ml-auto flex items-center gap-3">
                <button className="relative rounded-xl p-2 hover:bg-zinc-100 dark:hover:bg-zinc-900" aria-label="Notifications">
                  <Bell className="h-5 w-5" />
                  <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-500" />
                </button>

                <div className="flex items-center gap-2 rounded-xl px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-900">
                  <div className="h-8 w-8 rounded-full bg-zinc-200 dark:bg-zinc-800" />
                  <div className="text-sm font-medium">{user.name}</div>
                  <ChevronDown className="h-4 w-4 text-zinc-500" />
                </div>

                <div className="flex items-center gap-1 rounded-xl px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-900">
                  <span className="text-sm font-medium">EN</span>
                  <ChevronDown className="h-4 w-4 text-zinc-500" />
                </div>

                <ThemeToggle />
              </div>
            </div>
          </div>

          <main className="mx-auto max-w-[1280px] px-6 py-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
