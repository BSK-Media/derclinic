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
  ChevronRight,
  CalendarPlus,
  MapPin,
  User as UserIcon,
  Mail,
  Phone,
  Menu,
  X,
} from "lucide-react";
import { formatPLNFromGrosze } from "@/lib/money";
import { appointmentStatusLabel } from "@/lib/appointment-status";
import { LogoutButton } from "./LogoutButton";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pl-PL", {
    timeZone: "Europe/Warsaw",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatDateWithWeekday(iso: string) {
  return new Date(iso).toLocaleDateString("pl-PL", {
    timeZone: "Europe/Warsaw",
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pl-PL", { timeZone: "Europe/Warsaw", hour: "2-digit", minute: "2-digit" });
}

export type AppointmentRowData = {
  id: string;
  startsAt: string;
  status: string;
  priceFinal: number | null;
  priceEstimate: number | null;
  customServiceName: string | null;
  service: { name: string } | null;
  specialist: { name: string } | null;
  location: { name: string } | null;
};

export type PatientProfile = {
  name: string;
  phone: string | null;
  email: string | null;
  locationName: string | null;
  memberSince: string;
};

const NAV = [
  { id: "home", label: "Strona główna", icon: Home },
  { id: "upcoming", label: "Nadchodzące wizyty", icon: CalendarDays },
  { id: "history", label: "Historia wizyt", icon: History },
  { id: "profile", label: "Dane klienta", icon: IdCard },
  { id: "points", label: "Punkty lojalnościowe", icon: Star },
] as const;

type TabId = (typeof NAV)[number]["id"];

function AppointmentRow({ appointment, highlight = false }: { appointment: AppointmentRowData; highlight?: boolean }) {
  const serviceName = appointment.customServiceName || appointment.service?.name || "Zabieg";
  const price = appointment.priceFinal ?? appointment.priceEstimate;
  return (
    <div className={"rounded-2xl border bg-white p-4 shadow-sm sm:p-5 " + (highlight ? "border-emerald-200" : "border-zinc-200")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-medium text-zinc-900">{serviceName}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
            <span className="flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5" /> {formatDateWithWeekday(appointment.startsAt)}, {formatTime(appointment.startsAt)}
            </span>
            <span className="flex items-center gap-1">
              <UserIcon className="h-3.5 w-3.5" /> {appointment.specialist?.name ?? "—"}
            </span>
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" /> {appointment.location?.name ?? "—"}
            </span>
          </div>
        </div>
        <div className="text-right">
          <span className="inline-block rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600">
            {appointmentStatusLabel(appointment.status, appointment.startsAt)}
          </span>
          {price !== null && price !== undefined ? (
            <div className="mt-1.5 text-sm font-semibold text-emerald-700">{formatPLNFromGrosze(price)}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-200 bg-white p-6 text-center text-sm text-zinc-500">
      {text}
    </div>
  );
}

function ProfileField({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-zinc-100 py-3.5 last:border-0">
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-50 text-zinc-500 ring-1 ring-zinc-100">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">{label}</div>
        <div className="mt-0.5 truncate text-sm font-medium text-zinc-900">{value}</div>
      </div>
    </div>
  );
}

function PointsCard({ points, compact = false }: { points: number; compact?: boolean }) {
  return (
    <div className="rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50 to-white p-5 shadow-sm sm:p-6">
      <div className="text-sm font-semibold text-zinc-900">Punkty lojalnościowe</div>
      <div className="mt-4 flex items-center gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-violet-100">
          <Star className="h-6 w-6 text-violet-600" />
        </span>
        <div>
          <div className="text-2xl font-bold text-violet-700">{points} pkt</div>
          <div className="text-xs text-zinc-500">Program w przygotowaniu</div>
        </div>
      </div>
      {!compact ? (
        <p className="mt-4 text-xs text-zinc-500">
          Wkrótce będziesz mógł/mogła wymieniać punkty zebrane za wizyty i zakupy na kolejne zabiegi.
        </p>
      ) : null}
      <button
        type="button"
        disabled
        title="Dostępne wkrótce"
        className="mt-4 w-full cursor-not-allowed rounded-xl bg-violet-600/40 py-2.5 text-center text-sm font-semibold text-white"
      >
        Wykorzystaj punkty
      </button>
    </div>
  );
}

export function PatientDashboard({
  profile,
  upcoming,
  past,
  points,
}: {
  profile: PatientProfile;
  upcoming: AppointmentRowData[];
  past: AppointmentRowData[];
  points: number;
}) {
  const [tab, setTab] = React.useState<TabId>("home");
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);
  const firstNameOnly = profile.name.trim().split(/\s+/)[0] || profile.name;
  const nearest = upcoming[0] ?? null;
  const recentPast = past.slice(0, 2);

  function go(id: TabId) {
    setTab(id);
    setMobileNavOpen(false);
  }

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

        <nav className="mt-4 flex-1 space-y-1 px-1">
          {NAV.map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => go(id)}
                className={
                  "flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-medium transition " +
                  (active ? "bg-emerald-50 text-emerald-900" : "text-zinc-600 hover:bg-zinc-100/70")
                }
              >
                <span
                  className={
                    "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-sm ring-1 " +
                    (active ? "bg-emerald-600 text-white ring-emerald-600" : "bg-white text-zinc-500 ring-black/5")
                  }
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="truncate">{label}</span>
                {id === "upcoming" && upcoming.length > 0 ? (
                  <span
                    className={
                      "ml-auto rounded-full px-1.5 text-xs " +
                      (active ? "bg-emerald-600 text-white" : "bg-emerald-100 text-emerald-700")
                    }
                  >
                    {upcoming.length}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>

        <div className="mt-2 rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
          <LogoutButton />
        </div>
      </aside>

      {/* Main column */}
      <div className="flex-1 lg:ml-[264px]">
        {/* Top bar */}
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
              <span className="hidden h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-800 sm:inline-flex">
                {firstNameOnly.slice(0, 1).toUpperCase()}
              </span>
            </div>
          </div>
        </header>

        {/* Mobile nav drawer */}
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
              <nav className="mt-2 flex-1 space-y-1 px-1">
                {NAV.map(({ id, label, icon: Icon }) => {
                  const active = tab === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => go(id)}
                      className={
                        "flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-medium transition " +
                        (active ? "bg-emerald-50 text-emerald-900" : "text-zinc-600 hover:bg-zinc-100/70")
                      }
                    >
                      <span
                        className={
                          "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 " +
                          (active ? "bg-emerald-600 text-white ring-emerald-600" : "bg-white text-zinc-500 ring-black/5")
                        }
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="truncate">{label}</span>
                    </button>
                  );
                })}
              </nav>
              <div className="rounded-2xl border border-zinc-200 p-3">
                <LogoutButton />
              </div>
            </div>
          </div>
        ) : null}

        <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
          {tab === "home" ? (
            <div>
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                <h1 className="text-2xl font-bold text-zinc-900 sm:text-3xl">Twoje centrum wizyt</h1>
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-5 shadow-sm sm:p-6 lg:col-span-2">
                  <div className="text-sm font-semibold text-zinc-900">Najbliższa wizyta</div>
                  {nearest ? (
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-100">
                          <CalendarDays className="h-6 w-6 text-emerald-700" />
                        </span>
                        <div>
                          <div className="text-lg font-bold text-zinc-900">
                            {formatDate(nearest.startsAt)} • {formatTime(nearest.startsAt)}
                          </div>
                          <div className="text-sm text-zinc-600">
                            {nearest.customServiceName || nearest.service?.name || "Zabieg"}
                          </div>
                          <div className="mt-0.5 flex items-center gap-1 text-xs text-zinc-500">
                            <MapPin className="h-3.5 w-3.5" /> {nearest.location?.name ?? "—"}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => go("upcoming")}
                        className="flex shrink-0 items-center gap-1 rounded-full border border-zinc-200 bg-white px-3.5 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
                      >
                        Szczegóły <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="mt-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm text-zinc-500">Nie masz zaplanowanych wizyt.</p>
                      <Link
                        href="/book"
                        className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
                      >
                        <CalendarPlus className="h-4 w-4" /> Umów wizytę
                      </Link>
                    </div>
                  )}
                </div>

                <PointsCard points={points} compact />

                <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6 lg:col-span-2">
                  <div className="mb-1 flex items-center justify-between">
                    <div className="text-sm font-semibold text-zinc-900">Ostatnie wizyty</div>
                    {past.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => go("history")}
                        className="text-xs font-medium text-emerald-700 hover:underline"
                      >
                        Zobacz wszystkie
                      </button>
                    ) : null}
                  </div>
                  {recentPast.length === 0 ? (
                    <p className="mt-3 text-sm text-zinc-500">Brak wcześniejszych wizyt.</p>
                  ) : (
                    <div className="mt-2 divide-y divide-zinc-100">
                      {recentPast.map((appt) => (
                        <button
                          key={appt.id}
                          type="button"
                          onClick={() => go("history")}
                          className="flex w-full items-center justify-between gap-2 py-3 text-left transition hover:bg-zinc-50"
                        >
                          <div>
                            <div className="text-sm font-medium text-zinc-900">
                              {appt.customServiceName || appt.service?.name || "Zabieg"}
                            </div>
                            <div className="text-xs text-zinc-500">{formatDate(appt.startsAt)}</div>
                          </div>
                          <ChevronRight className="h-4 w-4 shrink-0 text-zinc-300" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
                  <div className="mb-1 flex items-center justify-between">
                    <div className="text-sm font-semibold text-zinc-900">Twoje dane</div>
                  </div>
                  <div className="mt-2 space-y-2.5 text-sm text-zinc-700">
                    <div className="flex items-center gap-2">
                      <UserIcon className="h-4 w-4 shrink-0 text-zinc-400" />
                      <span className="truncate">{profile.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 shrink-0 text-zinc-400" />
                      <span className="truncate">{profile.email || "—"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 shrink-0 text-zinc-400" />
                      <span className="truncate">{profile.phone || "—"}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => go("profile")}
                    className="mt-4 w-full rounded-xl bg-emerald-50 py-2.5 text-center text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
                  >
                    Zobacz pełne dane
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {tab === "upcoming" ? (
            <div>
              <h1 className="mb-5 text-xl font-bold text-zinc-900 sm:text-2xl">Nadchodzące wizyty</h1>
              {upcoming.length === 0 ? (
                <EmptyState text="Brak zaplanowanych wizyt." />
              ) : (
                <div className="space-y-3">
                  {upcoming.map((appt) => (
                    <AppointmentRow key={appt.id} appointment={appt} highlight />
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {tab === "history" ? (
            <div>
              <h1 className="mb-5 text-xl font-bold text-zinc-900 sm:text-2xl">Historia wizyt</h1>
              {past.length === 0 ? (
                <EmptyState text="Brak wcześniejszych wizyt." />
              ) : (
                <div className="space-y-3">
                  {past.map((appt) => (
                    <AppointmentRow key={appt.id} appointment={appt} />
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {tab === "points" ? (
            <div>
              <h1 className="mb-5 text-xl font-bold text-zinc-900 sm:text-2xl">Punkty lojalnościowe</h1>
              <div className="max-w-md">
                <PointsCard points={points} />
              </div>
            </div>
          ) : null}

          {tab === "profile" ? (
            <div>
              <h1 className="mb-5 text-xl font-bold text-zinc-900 sm:text-2xl">Dane klienta</h1>
              <div className="max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
                <ProfileField icon={UserIcon} label="Imię i nazwisko" value={profile.name || "—"} />
                <ProfileField icon={Phone} label="Telefon" value={profile.phone || "—"} />
                <ProfileField icon={Mail} label="E-mail" value={profile.email || "—"} />
                <ProfileField icon={MapPin} label="Lokalizacja" value={profile.locationName || "—"} />
                <ProfileField icon={CalendarDays} label="Klient od" value={profile.memberSince} />
              </div>
              <p className="mt-3 max-w-md text-xs text-zinc-400">
                Dane konta nie mogą być edytowane samodzielnie. Aby je zaktualizować, skontaktuj się telefonicznie z
                kliniką — recepcja zmieni je za Ciebie.
              </p>
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
}
