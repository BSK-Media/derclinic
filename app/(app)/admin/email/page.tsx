"use client";

import * as React from "react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import { EMAIL_STATUS_LABELS, EMAIL_TYPE_INFO, emailTypeLabel } from "@/lib/email-types";

type Config = { apiKeySet: boolean; from: string | null; appUrl: string | null; cronSecretSet: boolean };
type Settings = { disabledTypes: string[]; staffRecipients: string[]; notifySpecialist: boolean; replyTo: string | null };
type LogRow = {
  id: string;
  createdAt: string;
  type: string;
  recipient: string;
  subject: string;
  status: string;
  error: string | null;
};

const SECTION =
  "rounded-3xl border border-white/60 bg-white/80 p-6 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#0b1220]/55";
const INPUT =
  "h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-emerald-300 dark:border-white/10 dark:bg-[#0b1220]";
const PRIMARY_BUTTON =
  "rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50";
const SECONDARY_BUTTON =
  "rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10";

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("pl-PL", {
    timeZone: "Europe/Warsaw",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={"mt-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full " + (ok ? "bg-emerald-500" : "bg-amber-500")}
      aria-hidden
    />
  );
}

function ConfigRow({ ok, title, children }: { ok: boolean; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <StatusDot ok={ok} />
      <div className="min-w-0">
        <div className="text-sm font-semibold text-slate-900 dark:text-white">{title}</div>
        <div className="break-words text-sm text-slate-500 dark:text-slate-400">{children}</div>
      </div>
    </li>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (next: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={
        "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200 ease-out " +
        (checked ? "bg-emerald-600" : "bg-slate-200 dark:bg-white/15")
      }
    >
      <span
        className={
          "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 ease-out " +
          (checked ? "translate-x-6" : "translate-x-1")
        }
      />
    </button>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "SENT"
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300"
      : status === "FAILED"
        ? "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300"
        : "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300";
  return (
    <span className={"inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold " + tone}>
      {EMAIL_STATUS_LABELS[status] ?? status}
    </span>
  );
}

export default function EmailSettingsPage() {
  const { user } = useAuth();
  const [config, setConfig] = React.useState<Config | null>(null);
  const [settings, setSettings] = React.useState<Settings | null>(null);
  const [logs, setLogs] = React.useState<LogRow[]>([]);
  const [lastWeek, setLastWeek] = React.useState<Record<string, number>>({});
  const [loading, setLoading] = React.useState(true);
  const [dirty, setDirty] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const [testTo, setTestTo] = React.useState("");
  const [testing, setTesting] = React.useState(false);
  const [testResult, setTestResult] = React.useState<{ ok: boolean; message: string; hint?: string | null } | null>(null);

  const [newRecipient, setNewRecipient] = React.useState("");
  const [runningReminders, setRunningReminders] = React.useState(false);

  const load = React.useCallback(async (options?: { keepSettings?: boolean }) => {
    const response = await fetch("/api/admin/email", { cache: "no-store" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result?.ok) {
      toast.error(result?.message || "Nie udało się wczytać ustawień poczty.");
      return;
    }
    setConfig(result.config);
    setLogs(result.logs ?? []);
    setLastWeek(result.lastWeek ?? {});
    if (!options?.keepSettings) {
      setSettings(result.settings);
      setDirty(false);
    }
  }, []);

  React.useEffect(() => {
    if (user?.role !== "ADMIN") return;
    let active = true;
    (async () => {
      await load();
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [user?.role, load]);

  function update(patch: Partial<Settings>) {
    setSettings((current) => (current ? { ...current, ...patch } : current));
    setDirty(true);
  }

  function toggleType(type: string, enabled: boolean) {
    if (!settings) return;
    update({
      disabledTypes: enabled
        ? settings.disabledTypes.filter((item) => item !== type)
        : [...settings.disabledTypes.filter((item) => item !== type), type],
    });
  }

  function addRecipient() {
    if (!settings) return;
    const email = newRecipient.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Podaj poprawny adres e-mail.");
      return;
    }
    if (settings.staffRecipients.some((item) => item.toLowerCase() === email.toLowerCase())) {
      toast.error("Ten adres jest już na liście.");
      return;
    }
    update({ staffRecipients: [...settings.staffRecipients, email] });
    setNewRecipient("");
  }

  async function save() {
    if (!settings) return;
    setSaving(true);
    try {
      const response = await fetch("/api/admin/email", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...settings, replyTo: settings.replyTo?.trim() || null }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) {
        toast.error(result?.message || "Nie udało się zapisać ustawień.");
        return;
      }
      setSettings(result.settings);
      setDirty(false);
      toast.success("Ustawienia poczty zapisane.");
    } finally {
      setSaving(false);
    }
  }

  async function sendTest(event: React.FormEvent) {
    event.preventDefault();
    setTesting(true);
    setTestResult(null);
    try {
      const response = await fetch("/api/admin/email/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to: testTo.trim() }),
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok && result?.ok) {
        setTestResult({ ok: true, message: `Wiadomość testowa została przekazana do wysyłki na adres ${testTo.trim()}.` });
      } else {
        setTestResult({ ok: false, message: result?.message || "Nie udało się wysłać wiadomości.", hint: result?.hint });
      }
      await load({ keepSettings: true });
    } finally {
      setTesting(false);
    }
  }

  async function runReminders() {
    setRunningReminders(true);
    try {
      const response = await fetch("/api/admin/email/reminders", { method: "POST" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) {
        toast.error(result?.message || "Nie udało się uruchomić przypomnień.");
        return;
      }
      // Przypomnienia idą dwoma kanałami: e-mailem i powiadomieniem push.
      const emailNote = result.disabled
        ? "e-maile wyłączone w ustawieniach"
        : result.notConfigured
          ? "e-maile nie poszły (wysyłka nieskonfigurowana)"
          : `e-maile: ${result.sent}, wysłane wcześniej: ${result.alreadySent}, błędy: ${result.failed}`;
      toast.success(`Jutrzejsze wizyty: ${result.due}. Push: ${result.pushSent ?? 0}; ${emailNote}.`);
      await load({ keepSettings: true });
    } finally {
      setRunningReminders(false);
    }
  }

  if (user && user.role !== "ADMIN") {
    return (
      <div className="mx-auto w-full max-w-4xl">
        <div className={SECTION}>Ta sekcja jest dostępna wyłącznie dla administratora.</div>
      </div>
    );
  }

  const configured = Boolean(config?.apiKeySet && config?.from);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Poczta e-mail</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Wiadomości do klientów, powiadomienia dla personelu i kontrola, czy wysyłka działa.
        </p>
      </div>

      {loading || !config || !settings ? (
        <div className={SECTION}>Ładowanie…</div>
      ) : (
        <>
          <section className={SECTION}>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Stan konfiguracji</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Te wartości ustawia się w Vercel (Settings → Environment Variables), nie tutaj. Po zmianie trzeba
              wdrożyć aplikację ponownie.
            </p>
            <ul className="mt-4 space-y-3">
              <ConfigRow ok={config.apiKeySet} title="Klucz API Resend (RESEND_API_KEY)">
                {config.apiKeySet ? "Ustawiony." : "Brak — żadna wiadomość nie zostanie wysłana."}
              </ConfigRow>
              <ConfigRow ok={Boolean(config.from)} title="Adres nadawcy (RESEND_FROM_EMAIL)">
                {config.from ?? "Brak — podaj adres w domenie zweryfikowanej w Resend."}
              </ConfigRow>
              <ConfigRow ok={Boolean(config.appUrl)} title="Adres aplikacji w linkach (NEXT_PUBLIC_APP_URL)">
                {config.appUrl ?? "Nieustawiony — linki w wiadomościach użyją adresu, z którego przyszło żądanie."}
              </ConfigRow>
              <ConfigRow ok={config.cronSecretSet} title="Automatyczne przypomnienia (CRON_SECRET)">
                {config.cronSecretSet
                  ? "Ustawiony — przypomnienia wychodzą codziennie rano."
                  : "Brak — codzienna automatyczna wysyłka przypomnień nie działa. Do czasu ustawienia można je wysyłać ręcznie przyciskiem poniżej."}
              </ConfigRow>
            </ul>
            <p className="mt-4 text-xs text-slate-400">
              Ostatnie 7 dni: wysłano {lastWeek.SENT ?? 0}, błędy {lastWeek.FAILED ?? 0}, pominięto{" "}
              {lastWeek.SKIPPED ?? 0}.
            </p>
          </section>

          <section className={SECTION}>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Wyślij wiadomość testową</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Sprawdza całą drogę: klucz API, adres nadawcy i weryfikację domeny. Podaj dowolny adres.
            </p>
            <form onSubmit={sendTest} className="mt-4 flex flex-col gap-3 sm:flex-row">
              <input
                type="email"
                required
                value={testTo}
                onChange={(event) => setTestTo(event.target.value)}
                placeholder="adres@example.com"
                aria-label="Adres odbiorcy wiadomości testowej"
                className={INPUT}
              />
              <button type="submit" disabled={testing || !testTo.trim()} className={PRIMARY_BUTTON + " shrink-0"}>
                {testing ? "Wysyłanie…" : "Wyślij test"}
              </button>
            </form>
            {testResult ? (
              <div
                role="status"
                className={
                  "mt-4 rounded-2xl border p-4 text-sm " +
                  (testResult.ok
                    ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200"
                    : "border-red-200 bg-red-50 text-red-900 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200")
                }
              >
                <div className="break-words font-medium">{testResult.message}</div>
                {testResult.ok ? (
                  <div className="mt-1">Sprawdź skrzynkę, także folder spam.</div>
                ) : testResult.hint ? (
                  <div className="mt-1">{testResult.hint}</div>
                ) : null}
              </div>
            ) : !configured ? (
              <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">
                Wysyłka nie jest jeszcze skonfigurowana — test zakończy się błędem.
              </p>
            ) : null}
          </section>

          <section className={SECTION}>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Rodzaje wiadomości</h2>
            {(["PATIENT", "STAFF"] as const).map((audience) => (
              <div key={audience} className="mt-5">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {audience === "PATIENT" ? "Do klientów" : "Do personelu"}
                </div>
                <ul className="mt-2 divide-y divide-slate-100 dark:divide-white/10">
                  {EMAIL_TYPE_INFO.filter((info) => info.toggleable && info.audience === audience).map((info) => (
                    <li key={info.type} className="flex items-start justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900 dark:text-white">{info.label}</div>
                        <div className="text-sm text-slate-500 dark:text-slate-400">{info.description}</div>
                      </div>
                      <Toggle
                        label={info.label}
                        checked={!settings.disabledTypes.includes(info.type)}
                        onChange={(enabled) => toggleType(info.type, enabled)}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <p className="mt-3 text-xs text-slate-400">
              Wiadomość do klienta idzie tylko wtedy, gdy w jego karcie jest adres e-mail. Reset hasła jest zawsze
              włączony.
            </p>
          </section>

          <section className={SECTION}>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Odbiorcy powiadomień dla personelu</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Na te adresy trafiają powiadomienia o nowych rezerwacjach online i prośbach o zmianę danych.
            </p>
            {settings.staffRecipients.length === 0 ? (
              <p className="mt-4 rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-500 dark:border-white/10">
                Lista jest pusta — powiadomienia dla personelu nie są wysyłane (poza specjalistą, jeśli opcja poniżej
                jest włączona).
              </p>
            ) : (
              <ul className="mt-4 flex flex-wrap gap-2">
                {settings.staffRecipients.map((email) => (
                  <li
                    key={email}
                    className="flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1.5 pl-4 pr-2 text-sm dark:border-white/10 dark:bg-white/5"
                  >
                    <span className="break-all">{email}</span>
                    <button
                      type="button"
                      onClick={() => update({ staffRecipients: settings.staffRecipients.filter((item) => item !== email) })}
                      aria-label={`Usuń ${email}`}
                      className="flex h-6 w-6 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <input
                type="email"
                value={newRecipient}
                onChange={(event) => setNewRecipient(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addRecipient();
                  }
                }}
                placeholder="recepcja@example.com"
                aria-label="Nowy adres odbiorcy powiadomień"
                className={INPUT}
              />
              <button type="button" onClick={addRecipient} className={SECONDARY_BUTTON + " shrink-0"}>
                Dodaj adres
              </button>
            </div>

            <div className="mt-6 flex items-start justify-between gap-4 border-t border-slate-100 pt-5 dark:border-white/10">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900 dark:text-white">Powiadamiaj specjalistę</div>
                <div className="text-sm text-slate-500 dark:text-slate-400">
                  O nowej rezerwacji online dowiaduje się też specjalista, do którego umówiono wizytę — na adres
                  e-mail ze swojego konta.
                </div>
              </div>
              <Toggle
                label="Powiadamiaj specjalistę"
                checked={settings.notifySpecialist}
                onChange={(next) => update({ notifySpecialist: next })}
              />
            </div>

            <div className="mt-6 border-t border-slate-100 pt-5 dark:border-white/10">
              <label htmlFor="reply-to" className="text-sm font-semibold text-slate-900 dark:text-white">
                Adres do odpowiedzi (opcjonalnie)
              </label>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Gdy klient odpowie na wiadomość, jego odpowiedź trafi na ten adres zamiast na adres nadawcy.
              </p>
              <input
                id="reply-to"
                type="email"
                value={settings.replyTo ?? ""}
                onChange={(event) => update({ replyTo: event.target.value })}
                placeholder="kontakt@example.com"
                className={INPUT + " mt-2"}
              />
            </div>
          </section>

          <div className="sticky bottom-4 z-10 flex items-center justify-end gap-3">
            {dirty ? <span className="text-sm text-amber-700 dark:text-amber-300">Niezapisane zmiany</span> : null}
            <button type="button" onClick={save} disabled={!dirty || saving} className={PRIMARY_BUTTON}>
              {saving ? "Zapisywanie…" : "Zapisz ustawienia"}
            </button>
          </div>

          <section className={SECTION}>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Przypomnienia o wizytach</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Codziennie rano system wysyła przypomnienia klientom, którzy mają wizytę następnego dnia. Przycisk
              robi to samo od ręki; przypomnienie o tej samej wizycie nie pójdzie dwa razy.
            </p>
            <button type="button" onClick={runReminders} disabled={runningReminders} className={SECONDARY_BUTTON + " mt-4"}>
              {runningReminders ? "Wysyłanie…" : "Wyślij przypomnienia teraz"}
            </button>
          </section>

          <section className={SECTION}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Dziennik wysyłek</h2>
              <button type="button" onClick={() => load({ keepSettings: true })} className="text-sm text-emerald-700 hover:underline dark:text-emerald-300">
                Odśwież
              </button>
            </div>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Ostatnie 100 wiadomości.</p>
            {logs.length === 0 ? (
              <p className="mt-4 rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-500 dark:border-white/10">
                Nie wysłano jeszcze żadnej wiadomości.
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-slate-100 dark:divide-white/10">
                {logs.map((log) => (
                  <li key={log.id} className="py-3">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <StatusPill status={log.status} />
                      <span className="text-sm font-semibold text-slate-900 dark:text-white">
                        {emailTypeLabel(log.type)}
                      </span>
                      <span className="text-xs text-slate-400">{formatDateTime(log.createdAt)}</span>
                    </div>
                    <div className="mt-1 break-all text-sm text-slate-600 dark:text-slate-300">{log.recipient}</div>
                    {log.error ? (
                      <div className="mt-1 break-words text-sm text-red-700 dark:text-red-300">{log.error}</div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
