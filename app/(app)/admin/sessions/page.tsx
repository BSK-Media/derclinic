"use client";

import * as React from "react";
import Link from "next/link";
import useSWR from "swr";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";

type SessionBase = {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  ipAddress: string | null;
  userAgent: string | null;
};
type StaffSession = SessionBase & {
  mfaMethod: string;
  current: boolean;
  operator: { name: string } | null;
  user: { id: string; name: string; login: string; role: "ADMIN" | "MANAGER" | "RECEPTION" | "SPECIALIST" };
};
type PatientSession = SessionBase & { patient: { id: string; name: string } };
type Policy = { staffIdleHours: number; staffMaxHours: number; patientIdleDays: number; patientMaxDays: number };
type Response = { ok: boolean; message?: string; staff: StaffSession[]; patients: PatientSession[]; patientTotal: number; policy: Policy };

const SECTION =
  "rounded-3xl border border-white/60 bg-white/80 p-6 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#0b1220]/55";

const ROLE_LABELS = { ADMIN: "Administrator", MANAGER: "Manager", RECEPTION: "Recepcja", SPECIALIST: "Specjalista" } as const;
const MFA_LABELS: Record<string, string> = { TOTP: "kod z aplikacji", RECOVERY_CODE: "kod odzyskiwania", PASSKEY: "klucz dostępu" };

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((response) => response.json());

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("pl-PL", {
    timeZone: "Europe/Warsaw",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Np. "5 min temu", "2 godz. temu", "3 dni temu". */
function formatAgo(iso: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return "przed chwilą";
  if (minutes < 60) return `${minutes} min temu`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} godz. temu`;
  const days = Math.round(hours / 24);
  return `${days} ${days === 1 ? "dzień" : "dni"} temu`;
}

/** Czytelny opis urządzenia z nagłówka User-Agent, np. "Chrome · Windows". */
function describeDevice(userAgent: string | null) {
  if (!userAgent) return "Nieznane urządzenie";
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /OPR\/|Opera/.test(userAgent)
      ? "Opera"
      : /SamsungBrowser/.test(userAgent)
        ? "Samsung Internet"
        : /Firefox\/|FxiOS/.test(userAgent)
          ? "Firefox"
          : /Chrome\/|CriOS/.test(userAgent)
            ? "Chrome"
            : /Safari\//.test(userAgent)
              ? "Safari"
              : "Przeglądarka";
  const system = /iPhone/.test(userAgent)
    ? "iPhone"
    : /iPad/.test(userAgent)
      ? "iPad"
      : /Android/.test(userAgent)
        ? "Android"
        : /Windows/.test(userAgent)
          ? "Windows"
          : /Mac OS X|Macintosh/.test(userAgent)
            ? "Mac"
            : /Linux/.test(userAgent)
              ? "Linux"
              : "nieznany system";
  return `${browser} · ${system}`;
}

function SessionRow({
  title,
  subtitle,
  session,
  badge,
  onRevoke,
  revoking,
}: {
  title: string;
  subtitle: string;
  session: SessionBase;
  badge?: string;
  onRevoke?: () => void;
  revoking: boolean;
}) {
  return (
    <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-slate-900 dark:text-white">{title}</span>
          {badge ? (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300">
              {badge}
            </span>
          ) : null}
        </div>
        <div className="text-sm text-slate-500 dark:text-slate-400">{subtitle}</div>
        <div className="mt-1 break-words text-sm text-slate-600 dark:text-slate-300" title={session.userAgent ?? undefined}>
          {describeDevice(session.userAgent)} · IP {session.ipAddress ?? "nieznane"}
        </div>
        <div className="text-xs text-slate-400">
          Aktywność: {formatAgo(session.lastSeenAt)} · zalogowano {formatDateTime(session.createdAt)} · wygasa{" "}
          {formatDateTime(session.expiresAt)}
        </div>
      </div>
      {onRevoke ? (
        <button
          type="button"
          onClick={onRevoke}
          disabled={revoking}
          className="shrink-0 self-start rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-60 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300 sm:self-center"
        >
          {revoking ? "Kończenie…" : "Zakończ sesję"}
        </button>
      ) : null}
    </li>
  );
}

export default function ActiveSessionsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const { data, isLoading, mutate } = useSWR<Response>(isAdmin ? "/api/admin/sessions" : null, fetcher, {
    refreshInterval: 60_000,
  });
  const [revokingId, setRevokingId] = React.useState<string | null>(null);
  const [patientFilter, setPatientFilter] = React.useState("");

  // Wymaga ponownego MFA administratora — okno z kodem pojawi się samo.
  async function revoke(kind: "staff" | "patient", id: string, who: string) {
    if (!confirm(`Zakończyć sesję: ${who}?\n\nTa osoba zostanie wylogowana na tym jednym urządzeniu.`)) return;
    setRevokingId(id);
    try {
      const response = await fetch("/api/admin/sessions", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, id }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) return toast.error(result?.message || "Nie udało się zakończyć sesji.");
      toast.success("Sesja zakończona.");
      await mutate();
    } finally {
      setRevokingId(null);
    }
  }

  if (user && !isAdmin) {
    return (
      <div className="mx-auto w-full max-w-4xl">
        <div className={SECTION}>Ta sekcja jest dostępna wyłącznie dla administratora.</div>
      </div>
    );
  }

  const filter = patientFilter.trim().toLowerCase();
  const patients = (data?.patients ?? []).filter((session) => !filter || session.patient.name.toLowerCase().includes(filter));

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div>
        <Link href="/admin/settings" className="text-sm text-slate-500 hover:text-slate-800 dark:hover:text-white">
          ← Ustawienia
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Aktywne sesje</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Kto jest teraz zalogowany i na jakim urządzeniu. Każdą sesję można zakończyć zdalnie.
        </p>
      </div>

      {isLoading || !data ? (
        <div className={SECTION}>Ładowanie…</div>
      ) : !data.ok ? (
        <div className={SECTION + " text-red-600"}>{data.message || "Nie udało się wczytać sesji."}</div>
      ) : (
        <>
          <section className={SECTION}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Personel ({data.staff.length})</h2>
              <button type="button" onClick={() => mutate()} className="text-sm text-emerald-700 hover:underline dark:text-emerald-300">
                Odśwież
              </button>
            </div>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Sesja personelu wygasa po {data.policy.staffMaxHours} godz., a po {data.policy.staffIdleHours} godz.
              bezczynności wymaga ponownego logowania.
            </p>
            <ul className="mt-2 divide-y divide-slate-100 dark:divide-white/10">
              {data.staff.map((session) => (
                <SessionRow
                  key={session.id}
                  title={session.operator ? `${session.user.name} — teraz: ${session.operator.name}` : session.user.name}
                  subtitle={`${ROLE_LABELS[session.user.role] ?? session.user.role} · login ${session.user.login} · 2FA: ${
                    MFA_LABELS[session.mfaMethod] ?? session.mfaMethod
                  }`}
                  session={session}
                  badge={session.current ? "ta sesja" : undefined}
                  revoking={revokingId === session.id}
                  onRevoke={session.current ? undefined : () => revoke("staff", session.id, `${session.user.name} (${describeDevice(session.userAgent)})`)}
                />
              ))}
            </ul>
            <p className="mt-2 text-xs text-slate-400">
              Aby wylogować pracownika ze wszystkich urządzeń naraz, użyj „Wyloguj wszędzie” w Kontach pracowników.
            </p>
          </section>

          <section className={SECTION}>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Klienci ({data.patientTotal})</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Sesja klienta trwa do {data.policy.patientMaxDays} dni i kończy się po {data.policy.patientIdleDays}{" "}
              dniach bez aktywności.
              {data.patientTotal > data.patients.length
                ? ` Pokazano ${data.patients.length} ostatnio aktywnych z ${data.patientTotal}.`
                : ""}
            </p>
            {data.patients.length === 0 ? (
              <p className="mt-4 rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-500 dark:border-white/10">
                Żaden klient nie jest teraz zalogowany.
              </p>
            ) : (
              <>
                <input
                  value={patientFilter}
                  onChange={(event) => setPatientFilter(event.target.value)}
                  placeholder="Filtruj po nazwisku"
                  aria-label="Filtruj sesje klientów po nazwisku"
                  className="mt-4 h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-emerald-300 dark:border-white/10 dark:bg-[#0b1220]"
                />
                {patients.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-500">Brak sesji pasujących do filtra.</p>
                ) : (
                  <ul className="mt-2 divide-y divide-slate-100 dark:divide-white/10">
                    {patients.map((session) => (
                      <SessionRow
                        key={session.id}
                        title={session.patient.name}
                        subtitle="Panel klienta"
                        session={session}
                        revoking={revokingId === session.id}
                        onRevoke={() => revoke("patient", session.id, `${session.patient.name} (${describeDevice(session.userAgent)})`)}
                      />
                    ))}
                  </ul>
                )}
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
