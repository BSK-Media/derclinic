"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import useSWR from "swr";
import { toast } from "sonner";
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
  FileCheck,
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
  serviceId: string;
  specialistId: string;
  service: { name: string } | null;
  specialist: { name: string } | null;
  location: { name: string } | null;
  payments: { amount: number }[];
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
  { id: "consents", label: "Zgody", icon: FileCheck },
] as const;

type TabId = (typeof NAV)[number]["id"];

function AppointmentRow({
  appointment,
  highlight = false,
  showVisitCard = true,
}: {
  appointment: AppointmentRowData;
  highlight?: boolean;
  showVisitCard?: boolean;
}) {
  const serviceName = appointment.customServiceName || appointment.service?.name || "Zabieg";
  const price = appointment.priceFinal ?? appointment.priceEstimate;
  const paidTotal = (appointment.payments ?? []).reduce((sum, p) => sum + p.amount, 0);
  const isFullyPaid = price !== null && price !== undefined && price > 0 && paidTotal >= price;
  const isPartiallyPaid = paidTotal > 0 && !isFullyPaid;
  const remaining = price !== null && price !== undefined ? Math.max(0, price - paidTotal) : null;
  return (
    <div
      className={
        "rounded-2xl border bg-white p-4 shadow-sm sm:p-5 " + (highlight ? "border-emerald-200" : "border-zinc-200")
      }
    >
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
          {price ? (
            <div className="mt-1 flex flex-col items-end gap-0.5">
              {isFullyPaid ? (
                <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                  Opłacone w całości
                </span>
              ) : isPartiallyPaid ? (
                <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                  Zaliczka wpłacona: {formatPLNFromGrosze(paidTotal)}
                </span>
              ) : (
                <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                  Nieopłacone
                </span>
              )}
              {!isFullyPaid ? (
                <span className="text-[11px] text-zinc-500">Pozostało: {formatPLNFromGrosze(remaining)}</span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-zinc-100 pt-3">
        <Link
          href={`/panel-klienta/zabiegi/${appointment.serviceId}`}
          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-50"
        >
          Przeczytaj o zabiegu
        </Link>
        {showVisitCard ? (
          <Link
            href={`/panel-klienta/wizyty/${appointment.id}`}
            className="rounded-lg border border-emerald-600 px-3 py-1.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-50"
          >
            Sprawdź kartę wizyty
          </Link>
        ) : null}
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

const DATA_CHANGE_FIELD_LABELS: Record<string, string> = {
  NAME: "Imię i nazwisko",
  PHONE: "Telefon",
  EMAIL: "E-mail",
};

const dataChangeRequestFetcher = (url: string) => fetch(url).then((r) => r.json());

function DataChangeStatusPill({ status }: { status: string }) {
  if (status === "PENDING") {
    return (
      <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
        Oczekuje
      </span>
    );
  }
  if (status === "REJECTED") {
    return (
      <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-800">
        Odrzucona
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
      Zaakceptowana
    </span>
  );
}

function DataChangeRequestCard() {
  const { data, mutate } = useSWR("/api/patient/data-change-requests", dataChangeRequestFetcher);
  const requests: Array<{
    id: string;
    field: "NAME" | "PHONE" | "EMAIL";
    newValue: string;
    status: "PENDING" | "APPROVED" | "REJECTED";
    rejectionReason: string | null;
  }> = data?.requests ?? [];
  const pending = requests.find((r) => r.status === "PENDING") ?? null;

  const [field, setField] = React.useState<"NAME" | "PHONE" | "EMAIL">("PHONE");
  const [textValue, setTextValue] = React.useState("");
  const [phoneDigits, setPhoneDigits] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (field === "PHONE" && phoneDigits.length !== 9) {
      toast.error("Podaj prawidłowy 9-cyfrowy numer telefonu");
      return;
    }
    if (field !== "PHONE" && !textValue.trim()) {
      toast.error("Podaj nową wartość");
      return;
    }
    const newValue = field === "PHONE" ? `+48${phoneDigits}` : textValue.trim();

    setSubmitting(true);
    try {
      const res = await fetch("/api/patient/data-change-requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ field, newValue }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out?.ok) {
        toast.error(out?.message || "Nie udało się wysłać prośby");
        return;
      }
      toast.success("Wysłano prośbę o zmianę danych do recepcji");
      setTextValue("");
      setPhoneDigits("");
      mutate();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="text-sm font-semibold text-zinc-900">Poproś o zmianę danych</div>
      <p className="mb-4 mt-1 text-xs text-zinc-500">
        Wybierz, które dane chcesz zmienić, i podaj nową wartość — prośba trafi do recepcji, która ją zaakceptuje
        albo odrzuci.
      </p>

      {pending ? (
        <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          Masz oczekującą prośbę o zmianę pola „{DATA_CHANGE_FIELD_LABELS[pending.field]}" na „{pending.newValue}
          ” — czekaj na decyzję recepcji, zanim wyślesz kolejną.
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-600">Które dane chcesz zmienić?</label>
            <select
              value={field}
              onChange={(e) => setField(e.target.value as "NAME" | "PHONE" | "EMAIL")}
              className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-emerald-400"
            >
              <option value="PHONE">Telefon</option>
              <option value="EMAIL">E-mail</option>
              <option value="NAME">Imię i nazwisko</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-600">Nowa wartość</label>
            {field === "PHONE" ? (
              <div className="flex h-10 items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 focus-within:border-emerald-400">
                <span className="shrink-0 text-sm text-zinc-500">+48</span>
                <input
                  className="w-full border-0 bg-transparent p-0 text-sm outline-none"
                  inputMode="numeric"
                  value={phoneDigits}
                  onChange={(e) => setPhoneDigits(e.target.value.replace(/\D/g, "").slice(0, 9))}
                  placeholder="600000000"
                />
              </div>
            ) : (
              <input
                type={field === "EMAIL" ? "email" : "text"}
                value={textValue}
                onChange={(e) => setTextValue(e.target.value)}
                className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-emerald-400"
                placeholder={field === "EMAIL" ? "np. jan.kowalski@example.com" : "Imię i nazwisko"}
              />
            )}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
          >
            {submitting ? "Wysyłanie…" : "Wyślij prośbę o zmianę danych"}
          </button>
        </form>
      )}

      {requests.length > 0 ? (
        <div className="mt-5 space-y-2 border-t border-zinc-100 pt-4">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">Historia próśb</div>
          {requests.slice(0, 5).map((r) => (
            <div key={r.id} className="text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-zinc-600">
                  {DATA_CHANGE_FIELD_LABELS[r.field]}: {r.newValue}
                </span>
                <DataChangeStatusPill status={r.status} />
              </div>
              {r.status === "REJECTED" && r.rejectionReason ? (
                <div className="mt-0.5 text-[11px] text-red-600">Powód: {r.rejectionReason}</div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

type ConsentType = "RODO" | "MARKETING";
type ConsentRow = { type: ConsentType; granted: boolean; grantedAt: string | null; revokedAt: string | null };

// UWAGA: treść zgód poniżej to robocza propozycja tekstu — przed
// uruchomieniem produkcyjnym powinna zostać zweryfikowana przez osobę
// odpowiedzialną za zgodność prawną (RODO) w klinice.
const CONSENT_INFO: Record<ConsentType, { title: string; description: string }> = {
  RODO: {
    title: "Przetwarzanie danych osobowych (RODO)",
    description:
      "Wyrażam zgodę na przetwarzanie moich danych osobowych przez DerClinic w celu realizacji usług, prowadzenia dokumentacji oraz kontaktu w sprawach związanych z wizytami, zgodnie z RODO. Zgodę mogę wycofać w dowolnym momencie — nie wpływa to na zgodność z prawem przetwarzania dokonanego wcześniej.",
  },
  MARKETING: {
    title: "Komunikacja marketingowa",
    description:
      "Wyrażam zgodę na otrzymywanie od DerClinic powiadomień push w aplikacji oraz newslettera z informacjami o promocjach, nowych zabiegach i wydarzeniach. Zgodę mogę wycofać w dowolnym momencie.",
  },
};

function formatConsentDate(iso: string) {
  return new Date(iso).toLocaleString("pl-PL", {
    timeZone: "Europe/Warsaw",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ConsentToggle({ granted, onClick, disabled }: { granted: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={granted}
      onClick={onClick}
      disabled={disabled}
      className={
        "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition disabled:opacity-60 " +
        (granted ? "bg-emerald-600" : "bg-zinc-200")
      }
    >
      <span
        className={
          "inline-block h-5 w-5 transform rounded-full bg-white shadow transition " +
          (granted ? "translate-x-6" : "translate-x-1")
        }
      />
    </button>
  );
}

function ConsentsPanel() {
  const { data, mutate, isLoading } = useSWR("/api/patient/consents", dataChangeRequestFetcher);
  const consents: ConsentRow[] = data?.consents ?? [];
  const [savingType, setSavingType] = React.useState<ConsentType | null>(null);

  async function setConsent(type: ConsentType, granted: boolean) {
    setSavingType(type);
    try {
      const res = await fetch("/api/patient/consents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type, granted }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out?.ok) {
        toast.error(out?.message || "Nie udało się zapisać zgody");
        return;
      }
      toast.success(granted ? "Zgoda zapisana" : "Zgoda wycofana");
      mutate();
    } finally {
      setSavingType(null);
    }
  }

  return (
    <div className="space-y-4">
      {(["RODO", "MARKETING"] as const).map((type) => {
        const info = CONSENT_INFO[type];
        const row = consents.find((c) => c.type === type);
        const granted = row?.granted ?? false;
        return (
          <div key={type} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-zinc-900">{info.title}</div>
                <p className="mt-1 text-xs text-zinc-500">{info.description}</p>
                {granted && row?.grantedAt ? (
                  <p className="mt-2 text-xs text-emerald-700">Zaakceptowano {formatConsentDate(row.grantedAt)}</p>
                ) : !granted && row?.revokedAt ? (
                  <p className="mt-2 text-xs text-zinc-400">Wycofano {formatConsentDate(row.revokedAt)}</p>
                ) : null}
              </div>
              <ConsentToggle
                granted={granted}
                disabled={isLoading || savingType === type}
                onClick={() => setConsent(type, !granted)}
              />
            </div>
          </div>
        );
      })}

      <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-5 sm:p-6">
        <div className="text-sm font-semibold text-zinc-900">Zgoda na wizerunek</div>
        <p className="mt-1 text-xs text-zinc-500">
          Zgoda na wykorzystanie zdjęć przed/po zabiegu w panelu klienta i mediach społecznościowych jest wyrażana
          osobno przy każdej rezerwacji wizyty — zaznaczasz ją w formularzu rezerwacji online.
        </p>
      </div>
    </div>
  );
}

export type LoyaltyTransactionRow = {
  id: string;
  createdAt: string;
  type: "EARNED" | "REDEEMED";
  points: number;
  note: string | null;
  serviceName: string | null;
};

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
          <div className="text-xs text-zinc-500">≈ {points} zł rabatu</div>
        </div>
      </div>
      {!compact ? (
        <p className="mt-4 text-xs text-zinc-500">
          Za każde wydane 10 zł zbierasz 1 pkt. 1 pkt = 1 zł rabatu, który możesz wykorzystać podczas kolejnej
          rezerwacji online.
        </p>
      ) : null}
      <Link
        href="/book"
        className="mt-4 block w-full rounded-xl bg-violet-600 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-violet-700"
      >
        Umów wizytę i wykorzystaj punkty
      </Link>
    </div>
  );
}

function formatPointsDate(iso: string) {
  return new Date(iso).toLocaleDateString("pl-PL", {
    timeZone: "Europe/Warsaw",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function LoyaltyHistoryList({ history }: { history: LoyaltyTransactionRow[] }) {
  if (history.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-violet-200 bg-white p-6 text-center text-sm text-zinc-500">
        Brak jeszcze żadnych operacji na punktach.
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-violet-100 bg-white shadow-sm">
      <div className="divide-y divide-violet-50">
        {history.map((entry) => {
          const earned = entry.type === "EARNED";
          return (
            <div key={entry.id} className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="text-sm font-medium text-zinc-900">
                  {earned ? "Naliczono punkty" : "Wykorzystano punkty"}
                  {entry.serviceName ? ` — ${entry.serviceName}` : ""}
                </div>
                <div className="text-xs text-zinc-500">{formatPointsDate(entry.createdAt)}</div>
              </div>
              <div className={"shrink-0 text-sm font-semibold " + (earned ? "text-emerald-600" : "text-violet-600")}>
                {earned ? "+" : "-"}
                {entry.points} pkt
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function PatientDashboard({
  profile,
  upcoming,
  past,
  points,
  loyaltyHistory = [],
  initialTab = "home",
}: {
  profile: PatientProfile;
  upcoming: AppointmentRowData[];
  past: AppointmentRowData[];
  points: number;
  loyaltyHistory?: LoyaltyTransactionRow[];
  initialTab?: TabId;
}) {
  const [tab, setTab] = React.useState<TabId>(initialTab);
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
        <button type="button" onClick={() => go("home")} className="flex items-center gap-3 px-2 py-2 text-left">
          <div className="relative h-11 w-11 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
            <Image src="/derclinic-logo.webp" alt="DerClinic" fill className="object-contain p-1.5" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-zinc-900">DerClinic</div>
            <div className="truncate text-xs text-zinc-500">Panel klienta</div>
          </div>
        </button>

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

        <div className="mt-2 p-3">
          <LogoutButton />
        </div>
      </aside>

      {/* Main column */}
      <div className="flex-1 lg:ml-[264px]">
        {/* Top bar */}
        <header className="border-b border-zinc-200 bg-white pt-[env(safe-area-inset-top)]">
          <div className="relative flex items-center justify-between px-4 py-3.5 sm:px-6">
            <div className="flex items-center gap-2 lg:hidden">
              <button
                type="button"
                onClick={() => setMobileNavOpen(true)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 text-zinc-600"
                aria-label="Otwórz menu"
              >
                <Menu className="h-4.5 w-4.5" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => go("home")}
              className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center lg:hidden"
            >
              <Image src="/derclinic-logo.webp" alt="DerClinic" width={88} height={22} className="block" />
            </button>
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
              <button
                type="button"
                onClick={() => go("profile")}
                className="hidden h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-200 sm:inline-flex"
                aria-label="Dane klienta"
              >
                {firstNameOnly.slice(0, 1).toUpperCase()}
              </button>
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
              <div className="p-3">
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
                        <Link
                          key={appt.id}
                          href={`/panel-klienta/zabiegi/${appt.serviceId}`}
                          className="flex w-full items-center justify-between gap-2 py-3 text-left transition hover:bg-zinc-50"
                        >
                          <div>
                            <div className="text-sm font-medium text-zinc-900">
                              {appt.customServiceName || appt.service?.name || "Zabieg"}
                            </div>
                            <div className="text-xs text-zinc-500">{formatDate(appt.startsAt)}</div>
                          </div>
                          <ChevronRight className="h-4 w-4 shrink-0 text-zinc-300" />
                        </Link>
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
                    <AppointmentRow key={appt.id} appointment={appt} highlight showVisitCard={false} />
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
              <div className="grid gap-4 lg:grid-cols-[minmax(0,320px)_1fr]">
                <PointsCard points={points} />
                <div>
                  <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    Historia punktów
                  </div>
                  <LoyaltyHistoryList history={loyaltyHistory} />
                </div>
              </div>
            </div>
          ) : null}

          {tab === "profile" ? (
            <div>
              <h1 className="mb-5 text-xl font-bold text-zinc-900 sm:text-2xl">Dane klienta</h1>
              <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
                <div>
                  <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
                    <ProfileField icon={UserIcon} label="Imię i nazwisko" value={profile.name || "—"} />
                    <ProfileField icon={Phone} label="Telefon" value={profile.phone || "—"} />
                    <ProfileField icon={Mail} label="E-mail" value={profile.email || "—"} />
                    <ProfileField icon={MapPin} label="Lokalizacja" value={profile.locationName || "—"} />
                    <ProfileField icon={CalendarDays} label="Klient od" value={profile.memberSince} />
                  </div>
                  <p className="mt-3 text-xs text-zinc-400">
                    Dane konta nie mogą być edytowane samodzielnie. Skorzystaj z formularza obok, aby wysłać prośbę
                    o zmianę — recepcja ją zaakceptuje albo odrzuci.
                  </p>
                </div>
                <DataChangeRequestCard />
              </div>
            </div>
          ) : null}

          {tab === "consents" ? (
            <div>
              <h1 className="mb-5 text-xl font-bold text-zinc-900 sm:text-2xl">Zgody</h1>
              <div className="max-w-xl">
                <ConsentsPanel />
              </div>
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
}
