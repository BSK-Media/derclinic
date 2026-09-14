"use client";

import * as React from "react";
import Link from "next/link";
import { Home, CalendarDays, CalendarPlus, Star, Menu, X, History, IdCard, FileCheck } from "lucide-react";

// Tryb standalone = aplikacja zainstalowana na ekranie głównym (PWA), nie
// zwykła karta przeglądarki — dolna nawigacja pokazuje się WYŁĄCZNIE tam.
// iOS nie ma media query "display-mode: standalone" w starszych wersjach,
// stąd dodatkowy, historyczny navigator.standalone jako fallback.
export function useIsStandalone() {
  const [standalone, setStandalone] = React.useState(false);

  React.useEffect(() => {
    const mediaQuery = window.matchMedia("(display-mode: standalone)");
    const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    const update = () => setStandalone(mediaQuery.matches || iosStandalone);
    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  return standalone;
}

export type PatientBottomNavTab = "home" | "upcoming" | "history" | "profile" | "points" | "consents";

type Props =
  | { mode: "tabs"; activeTab: PatientBottomNavTab; onNavigate: (tab: PatientBottomNavTab) => void }
  | { mode: "links" };

const MORE_ITEMS: ReadonlyArray<{ id: PatientBottomNavTab; label: string; icon: React.ElementType }> = [
  { id: "history", label: "Historia wizyt", icon: History },
  { id: "profile", label: "Dane klienta", icon: IdCard },
  { id: "consents", label: "Zgody", icon: FileCheck },
];

function tabHref(tab: PatientBottomNavTab) {
  return `/panel-klienta?tab=${tab}`;
}

// Dolna nawigacja w stylu aplikacji mobilnej — 5 ikon: strona główna,
// nadchodzące wizyty, wyróżniony środkowy przycisk "Umów wizytę", punkty
// lojalnościowe, i menu z pozostałymi zakładkami. Używany zarówno na
// stronie głównej panelu (mode="tabs" — przełącza lokalny stan bez
// przeładowania), jak i na podstronach zabiegu/specjalisty/wizyty
// (mode="links" — prawdziwa nawigacja z powrotem do /panel-klienta).
export function PatientBottomNav(props: Props) {
  const standalone = useIsStandalone();
  const [moreOpen, setMoreOpen] = React.useState(false);

  if (!standalone) return null;

  const activeTab = props.mode === "tabs" ? props.activeTab : null;
  const moreActive = activeTab !== null && MORE_ITEMS.some((item) => item.id === activeTab);

  function itemClass(isActive: boolean) {
    return (
      "flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] font-medium transition " +
      (isActive ? "text-emerald-700" : "text-zinc-500")
    );
  }

  function NavButton({
    tab,
    label,
    icon: Icon,
  }: {
    tab: "home" | "upcoming" | "points";
    label: string;
    icon: React.ElementType;
  }) {
    if (props.mode === "tabs") {
      return (
        <button type="button" onClick={() => props.onNavigate(tab)} className={itemClass(activeTab === tab)}>
          <Icon className="h-5 w-5" />
          {label}
        </button>
      );
    }
    return (
      <Link href={tabHref(tab)} className={itemClass(false)}>
        <Icon className="h-5 w-5" />
        {label}
      </Link>
    );
  }

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-zinc-200 bg-white/95 backdrop-blur lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <NavButton tab="home" label="Strona główna" icon={Home} />
        <NavButton tab="upcoming" label="Wizyty" icon={CalendarDays} />

        <div className="flex flex-1 items-center justify-center">
          <Link
            href="/book"
            aria-label="Umów wizytę"
            className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg ring-4 ring-white transition hover:bg-emerald-700"
          >
            <CalendarPlus className="h-6 w-6" />
          </Link>
        </div>

        <NavButton tab="points" label="Punkty" icon={Star} />

        <button type="button" onClick={() => setMoreOpen(true)} className={itemClass(moreActive)}>
          <Menu className="h-5 w-5" />
          Menu
        </button>
      </nav>

      {moreOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setMoreOpen(false)} />
          <div
            className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white p-3 shadow-2xl"
            style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
          >
            <div className="mb-1 flex items-center justify-between px-1 py-1">
              <div className="text-sm font-semibold text-zinc-900">Więcej</div>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="text-zinc-400 transition hover:text-zinc-600"
                aria-label="Zamknij"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-1 pb-1">
              {MORE_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                const className =
                  "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition " +
                  (isActive ? "bg-emerald-50 text-emerald-900" : "text-zinc-700 hover:bg-zinc-100");
                if (props.mode === "tabs") {
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        props.onNavigate(item.id);
                        setMoreOpen(false);
                      }}
                      className={className}
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </button>
                  );
                }
                return (
                  <Link key={item.id} href={tabHref(item.id)} onClick={() => setMoreOpen(false)} className={className}>
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
