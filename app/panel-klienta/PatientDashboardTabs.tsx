"use client";

import * as React from "react";
import { CalendarDays, MapPin, User as UserIcon, History, Award, IdCard } from "lucide-react";
import { formatPLNFromGrosze } from "@/lib/money";
import { appointmentStatusLabel } from "@/lib/appointment-status";

function formatDate(iso: string) {
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

function AppointmentRow({ appointment, highlight = false }: { appointment: AppointmentRowData; highlight?: boolean }) {
  const serviceName = appointment.customServiceName || appointment.service?.name || "Zabieg";
  const price = appointment.priceFinal ?? appointment.priceEstimate;
  return (
    <div className={"rounded-2xl border bg-white p-4 shadow-sm sm:p-5 " + (highlight ? "border-emerald-200" : "")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-medium text-zinc-900">{serviceName}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
            <span className="flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5" /> {formatDate(appointment.startsAt)}, {formatTime(appointment.startsAt)}
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
    <div className="rounded-2xl border border-dashed bg-white p-6 text-center text-sm text-zinc-500">{text}</div>
  );
}

function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-zinc-100 py-3 last:border-0">
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">{label}</div>
      <div className="mt-0.5 text-sm text-zinc-900">{value}</div>
    </div>
  );
}

const TABS = [
  { id: "upcoming", label: "Nadchodzące wizyty", icon: CalendarDays },
  { id: "history", label: "Historia wizyt", icon: History },
  { id: "points", label: "Moje punkty", icon: Award },
  { id: "profile", label: "Moje dane", icon: IdCard },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function PatientDashboardTabs({
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
  const [tab, setTab] = React.useState<TabId>("upcoming");

  return (
    <div>
      <div className="mb-6 flex gap-1.5 overflow-x-auto rounded-2xl border bg-white p-1.5 shadow-sm">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={
              "flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-medium transition " +
              (tab === id ? "bg-emerald-600 text-white" : "text-zinc-600 hover:bg-zinc-50")
            }
          >
            <Icon className="h-4 w-4" />
            {label}
            {id === "upcoming" && upcoming.length > 0 ? (
              <span
                className={
                  "ml-0.5 rounded-full px-1.5 text-xs " +
                  (tab === id ? "bg-white/20" : "bg-emerald-100 text-emerald-700")
                }
              >
                {upcoming.length}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {tab === "upcoming" ? (
        <section>
          {upcoming.length === 0 ? (
            <EmptyState text="Brak zaplanowanych wizyt." />
          ) : (
            <div className="space-y-3">
              {upcoming.map((appt) => (
                <AppointmentRow key={appt.id} appointment={appt} highlight />
              ))}
            </div>
          )}
        </section>
      ) : null}

      {tab === "history" ? (
        <section>
          {past.length === 0 ? (
            <EmptyState text="Brak wcześniejszych wizyt." />
          ) : (
            <div className="space-y-3">
              {past.map((appt) => (
                <AppointmentRow key={appt.id} appointment={appt} />
              ))}
            </div>
          )}
        </section>
      ) : null}

      {tab === "points" ? (
        <section>
          <div className="rounded-2xl border bg-white p-6 text-center shadow-sm sm:p-8">
            <Award className="mx-auto h-8 w-8 text-emerald-600" />
            <div className="mt-3 text-3xl font-semibold text-zinc-900">{points} pkt</div>
            <p className="mx-auto mt-2 max-w-sm text-sm text-zinc-500">
              Program punktowy jest w przygotowaniu. Wkrótce będziesz mógł/mogła wymieniać punkty zebrane za wizyty
              i zakupy na kolejne zabiegi.
            </p>
          </div>
        </section>
      ) : null}

      {tab === "profile" ? (
        <section>
          <div className="rounded-2xl border bg-white p-5 shadow-sm sm:p-6">
            <ProfileField label="Imię i nazwisko" value={profile.name || "—"} />
            <ProfileField label="Telefon" value={profile.phone || "—"} />
            <ProfileField label="E-mail" value={profile.email || "—"} />
            <ProfileField label="Lokalizacja" value={profile.locationName || "—"} />
            <ProfileField label="Klient od" value={profile.memberSince} />
          </div>
          <p className="mt-3 text-xs text-zinc-400">
            Dane konta nie mogą być edytowane samodzielnie. Aby je zaktualizować, skontaktuj się telefonicznie z
            kliniką — recepcja zmieni je za Ciebie.
          </p>
        </section>
      ) : null}
    </div>
  );
}
