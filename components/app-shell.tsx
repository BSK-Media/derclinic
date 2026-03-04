"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(href + "/");
  return (
    <Link
      href={href}
      className={[
        "block rounded-md px-3 py-2 text-sm transition",
        active ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-900",
      ].join(" ")}
    >
      {label}
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();

  if (loading) return <div className="p-6 text-sm text-zinc-500">Ładowanie…</div>;
  if (!user) return <div className="p-6 text-sm text-zinc-500">Brak sesji.</div>;

  const isAdmin = user.role === "ADMIN" || user.role === "RECEPTION";
  const isSpecialist = user.role === "SPECIALIST";

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="flex gap-6">
          <aside className="w-72 shrink-0">
            <div className="rounded-xl border bg-white p-4 shadow-sm dark:bg-zinc-950">
              <div className="flex items-start justify-between gap-3">
                <Image src="/derclinic-logo.webp" alt="DerClinic" width={56} height={56} />
                <div>
                  <div className="font-semibold leading-tight">DerClinic OS</div>
                  <div className="text-xs text-zinc-500">{user.name} • {user.role}</div>
                </div>
                <ThemeToggle />
              </div>

              <div className="mt-4 space-y-1">
                {isAdmin && (
                  <>
                    <NavLink href="/admin" label="Dashboard" />
                    <NavLink href="/admin/visits" label="Wizyty" />
                    <NavLink href="/admin/revenue" label="Przychód" />
                    <NavLink href="/admin/clinic-treatments" label="Zabiegów Klinika" />
                    <NavLink href="/admin/new-patients" label="Nowi Pacjenci" />
                    <NavLink href="/admin/profile" label="Drofila" />
                    <NavLink href="/admin/inventory-alerts" label="Magazyn - Alerty" />
                    <NavLink href="/admin/inventory" label="Magazyn preparatów" />
                    <NavLink href="/admin/supplies" label="Wapozylanie" />
                  </>
                )}
                {isSpecialist && (
                  <>
                    <NavLink href="/specialist" label="Mój dzień" />
                    <NavLink href="/specialist/schedule" label="Grafik" />
                    <NavLink href="/specialist/appointments" label="Wizyty" />
                  </>
                )}
                {user.role === "ADMIN" && (
                  <NavLink href="/specialist" label="Podgląd: specjalista" />
                )}
              </div>

              <div className="mt-4">
                <Button variant="outline" className="w-full" onClick={logout}>
                  Wyloguj
                </Button>
              </div>
            </div>
          </aside>

          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </div>
    </div>
  );
}
