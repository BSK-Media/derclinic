"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Home,
  CalendarDays,
  History,
  IdCard,
  Star,
  Sparkles,
  CalendarPlus,
  Menu,
  X,
} from "lucide-react";
import { LogoutButton } from "./LogoutButton";

const NAV = [
  { id: "home", label: "Strona główna", icon: Home, href: "/panel-klienta" },
  { id: "services", label: "Usługi i zabiegi", icon: Sparkles, href: null },
  { id: "upcoming", label: "Nadchodzące wizyty", icon: CalendarDays, href: "/panel-klienta" },
  { id: "history", label: "Historia wizyt", icon: History, href: "/panel-klienta" },
  { id: "profile", label: "Dane klienta", icon: IdCard, href: "/panel-klienta" },
  { id: "points", label: "Punkty lojalnościowe", icon: Star, href: "/panel-klienta" },
] as const;

export function PatientPageShell({
  patientName,
  upcomingCount,
  children,
}: {
  patientName: string;
  upcomingCount: number;
  children: React.ReactNode;
}) {
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);
  const firstNameOnly = patientName.trim().split(/\s+/)[0] || patientName;

  const navList = (onNavigate?: () => void) => (
    <>
      {NAV.map(({ id, label, icon: Icon, href }) => {
        // "Usługi i zabiegi" nie ma jeszcze osobnej listy — reprezentuje
        // sekcję, w której obecnie jesteśmy (strona zabiegu/specjalisty).
        const active = id === "services";
        const content = (
          <>
            <span
              className={
                "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-sm ring-1 " +
                (active ? "bg-emerald-600 text-white ring-emerald-600" : "bg-white text-zinc-500 ring-black/5")
              }
            >
              <Icon className="h-4 w-4" />
            </span>
            <span className="truncate">{label}</span>
            {id === "upcoming" && upcomingCount > 0 ? (
              <span
                className={
                  "ml-auto rounded-full px-1.5 text-xs " +
                  (active ? "bg-emerald-600 text-white" : "bg-emerald-100 text-emerald-700")
                }
              >
                {upcomingCount}
              </span>
            ) : null}
          </>
        );
        const className =
          "flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-medium transition " +
          (active ? "bg-emerald-50 text-emerald-900" : "text-zinc-600 hover:bg-zinc-100/70");
        return href ? (
          <Link key={id} href={href} onClick={onNavigate} className={className}>
            {content}
          </Link>
        ) : (
          <span key={id} className={className}>
            {content}
          </span>
        );
      })}
    </>
  );

  return (
    <div className="min-h-screen bg-zinc-50 lg:flex">
      {/* Sidebar — desktop */}
      <aside className="hidden w-[264px] shrink-0 border-r border-zinc-200 bg-white/70 p-3 backdrop-blur lg:fixed lg:left-0 lg:top-0 lg:flex lg:h-screen lg:flex-col">
        <div className="flex items-center gap-3 px-2 py-2">
          <div className="relative h-11 w-11 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
            <Image src="/derclinic-logo.webp" alt="DerClinic" fill className="object-contain p-1.5" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-zinc-900">DerClinic</div>
            <div className="truncate text-xs text-zinc-500">Panel klienta</div>
          </div>
        </div>

        <nav className="mt-4 flex-1 space-y-1 px-1">{navList()}</nav>

        <div className="mt-2 p-3">
          <LogoutButton />
        </div>
      </aside>

      {/* Main column */}
      <div className="flex-1 lg:ml-[264px]">
        <header className="border-b border-zinc-200 bg-white">
          <div className="flex items-center justify-between px-4 py-3.5 sm:px-6">
            <div className="flex items-center gap-2 lg:hidden">
              <button
                type="button"
                onClick={() => setMobileNavOpen(true)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 text-zinc-600"
                aria-label="Otwórz menu"
              >
                <Menu className="h-4.5 w-4.5" />
              </button>
              <Image src="/derclinic-logo.webp" alt="DerClinic" width={110} height={28} />
            </div>
            <div className="hidden text-sm text-zinc-600 lg:block">
              Dzień dobry, <span className="font-semibold text-zinc-900">{firstNameOnly}</span>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/book"
                className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 sm:px-4"
              >
                <CalendarPlus className="h-4 w-4" />
                <span className="hidden sm:inline">Umów wizytę</span>
              </Link>
              <Link
                href="/panel-klienta?tab=profile"
                className="hidden h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-200 sm:inline-flex"
                aria-label="Dane klienta"
              >
                {firstNameOnly.slice(0, 1).toUpperCase()}
              </Link>
            </div>
          </div>
        </header>

        {mobileNavOpen ? (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-black/30" onClick={() => setMobileNavOpen(false)} />
            <div className="absolute left-0 top-0 flex h-full w-[78%] max-w-xs flex-col bg-white p-3 shadow-xl">
              <div className="flex items-center justify-between px-2 py-2">
                <div className="text-sm font-semibold text-zinc-900">Menu</div>
                <button
                  type="button"
                  onClick={() => setMobileNavOpen(false)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100"
                  aria-label="Zamknij menu"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <nav className="mt-2 flex-1 space-y-1 px-1">{navList(() => setMobileNavOpen(false))}</nav>
              <div className="p-3">
                <LogoutButton />
              </div>
            </div>
          </div>
        ) : null}

        <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
