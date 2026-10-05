"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import { EMAIL_STATUS_LABELS, EMAIL_TYPE_INFO, emailTypeLabel } from "@/lib/email-types";

type Stats = { patientDevices: number; patients: number; staffDevices: number; staff: number; marketingPatients: number };
type LogRow = { id: string; createdAt: string; type: string; recipient: string; subject: string; status: string; error: string | null };
type Recipient = { id: string; name: string; phone: string | null; devices: number };
type Audience = "patient" | "all" | "marketing";

const SECTION =
  "rounded-3xl border border-white/60 bg-white/80 p-6 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#0b1220]/55";
const INPUT =
  "w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-emerald-300 dark:border-white/10 dark:bg-[#0b1220]";
const PRIMARY_BUTTON =
  "rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50";

const TITLE_MAX = 60;
const BODY_MAX = 180;

// Gotowe treści do szybkiego wstawienia — można je dowolnie poprawić przed wysłaniem.
const TEMPLATES: { label: string; title: string; body: string }[] = [
  {
    label: "Wizyta odwołana",
    title: "Wizyta odwołana",
    body: "Twoja wizyta w DerClinic została odwołana. Skontaktuj się z nami, aby ustalić nowy termin.",
  },
  {
    label: "Zmiana terminu",
    title: "Zmiana terminu wizyty",
    body: "Musimy przełożyć Twoją wizytę. Prosimy o kontakt z recepcją w celu ustalenia nowego terminu.",
  },
  {
    label: "Prośba o kontakt",
    title: "Prosimy o kontakt",
    body: "Prosimy o kontakt z recepcją DerClinic w sprawie Twojej wizyty.",
  },
  {
    label: "Klinika nieczynna",
    title: "Zmiana godzin pracy",
    body: "Informujemy o zmianie godzin pracy kliniki. Szczegóły w panelu klienta lub w recepcji.",
  },
];

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
      : "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300";
  return (
    <span className={"inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold " + tone}>
      {EMAIL_STATUS_LABELS[status] ?? status}
    </span>
  );
}

export default function PushSettingsPage() {
  const { user } = useAuth();
  const [stats, setStats] = React.useState<Stats | null>(null);
  const [disabled, setDisabled] = React.useState<string[]>([]);
  const [logs, setLogs] = React.useState<LogRow[]>([]);
  const [loading, setLoading] = React.useState(true);

  const [audience, setAudience] = React.useState<Audience>("patient");
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<Recipient[]>([]);
  const [recipient, setRecipient] = React.useState<Recipient | null>(null);
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [sending, setSending] = React.useState(false);

  const load = React.useCallback(async () => {
    const response = await fetch("/api/admin/push", { cache: "no-store" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result?.ok) {
      toast.error(result?.message || "Nie udało się wczytać ustawień powiadomień.");
      return;
    }
    setStats(result.stats);
    setDisabled(result.disabledPushTypes ?? []);
    setLogs(result.logs ?? []);
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

  // Wyszukiwanie klienta — z krótkim opóźnieniem, żeby nie pytać serwera po każdej literze.
  React.useEffect(() => {
    if (audience !== "patient" || recipient || query.trim().length < 2) return;
    let active = true;
    const timer = window.setTimeout(async () => {
      const response = await fetch(`/api/admin/push/recipients?q=${encodeURIComponent(query.trim())}`, { cache: "no-store" });
      const result = await response.json().catch(() => ({}));
      if (active && result?.ok) setResults(result.patients ?? []);
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [audience, recipient, query]);

  async function toggleType(type: string, enabled: boolean) {
    const previous = disabled;
    const next = enabled ? disabled.filter((item) => item !== type) : [...disabled.filter((item) => item !== type), type];
    setDisabled(next);
    const response = await fetch("/api/admin/push", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ disabledPushTypes: next }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result?.ok) {
      setDisabled(previous);
      toast.error(result?.message || "Nie udało się zapisać ustawienia.");
    }
  }

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (audience === "patient" && !recipient) return toast.error("Wybierz klienta z listy.");
    if (audience !== "patient") {
      const count = audience === "all" ? stats?.patients : stats?.marketingPatients;
      const group = audience === "all" ? "wszystkich klientów z włączonymi powiadomieniami" : "klientów ze zgodą marketingową";
      if (!confirm(`Wysłać to powiadomienie do ${group} (${count ?? 0})?\n\n„${title.trim()}”\n${body.trim()}`)) return;
    }

    setSending(true);
    try {
      const response = await fetch("/api/admin/push/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ audience, patientId: recipient?.id, title: title.trim(), body: body.trim() }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) {
        toast.error(result?.message || "Nie udało się wysłać powiadomienia.");
        return;
      }
      toast.success(`Powiadomienie wysłane na ${result.sent} z ${result.devices} urządzeń.`);
      setTitle("");
      setBody("");
      await load();
    } finally {
      setSending(false);
    }
  }

  function pickAudience(next: Audience) {
    setAudience(next);
    setRecipient(null);
    setQuery("");
    setResults([]);
  }

  if (user && user.role !== "ADMIN") {
    return (
      <div className="mx-auto w-full max-w-4xl">
        <div className={SECTION}>Ta sekcja jest dostępna wyłącznie dla administratora.</div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div>
        <Link href="/admin/settings" className="text-sm text-slate-500 hover:text-slate-800 dark:hover:text-white">
          ← Ustawienia
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Powiadomienia push</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Powiadomienia na telefon i komputer — automatyczne (jak e-maile) oraz wysyłane ręcznie.
        </p>
      </div>

      {loading || !stats ? (
        <div className={SECTION}>Ładowanie…</div>
      ) : (
        <>
          <section className={SECTION}>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Kto odbiera powiadomienia</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Powiadomienia dostaje tylko ten, kto sam je włączył na swoim urządzeniu: klient w panelu klienta
              (zakładka Zgody), pracownik w Ustawieniach.
            </p>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-white/5">
                <dt className="text-sm text-slate-500 dark:text-slate-400">Klienci</dt>
                <dd className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">{stats.patients}</dd>
                <dd className="text-xs text-slate-500 dark:text-slate-400">
                  urządzeń: {stats.patientDevices} · ze zgodą marketingową: {stats.marketingPatients}
                </dd>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-white/5">
                <dt className="text-sm text-slate-500 dark:text-slate-400">Pracownicy</dt>
                <dd className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">{stats.staff}</dd>
                <dd className="text-xs text-slate-500 dark:text-slate-400">urządzeń: {stats.staffDevices}</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-slate-400">
              Na iPhonie powiadomienia działają tylko w aplikacji dodanej do ekranu głównego.
            </p>
          </section>

          <section className={SECTION}>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Wyślij powiadomienie ręcznie</h2>
            <form onSubmit={send} className="mt-4 space-y-4">
              <fieldset>
                <legend className="text-sm font-semibold text-slate-900 dark:text-white">Do kogo</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(
                    [
                      ["patient", "Wybrany klient"],
                      ["all", `Wszyscy klienci (${stats.patients})`],
                      ["marketing", `Ze zgodą marketingową (${stats.marketingPatients})`],
                    ] as [Audience, string][]
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={audience === value}
                      onClick={() => pickAudience(value)}
                      className={
                        "rounded-full border px-4 py-2 text-sm font-medium transition " +
                        (audience === value
                          ? "border-emerald-600 bg-emerald-600 text-white"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200")
                      }
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {audience === "all" ? (
                  <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                    Do wszystkich wysyłaj tylko informacje organizacyjne (np. zmiana godzin pracy). Promocje i nowości
                    wymagają zgody marketingowej — wybierz wtedy trzecią opcję.
                  </p>
                ) : null}
              </fieldset>

              {audience === "patient" ? (
                <div>
                  <label htmlFor="push-recipient" className="text-sm font-semibold text-slate-900 dark:text-white">
                    Klient
                  </label>
                  {recipient ? (
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-sm dark:border-white/10 dark:bg-white/5">
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 dark:text-white">{recipient.name}</div>
                        <div className={recipient.devices > 0 ? "text-slate-500" : "text-amber-700 dark:text-amber-300"}>
                          {recipient.devices > 0
                            ? `Powiadomienia włączone (urządzeń: ${recipient.devices})`
                            : "Ten klient nie włączył powiadomień — nic do niego nie dotrze."}
                        </div>
                      </div>
                      <button type="button" onClick={() => setRecipient(null)} className="text-sm text-emerald-700 underline dark:text-emerald-300">
                        Zmień
                      </button>
                    </div>
                  ) : (
                    <>
                      <input
                        id="push-recipient"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Szukaj po nazwisku lub telefonie"
                        autoComplete="off"
                        className={INPUT + " mt-2 h-11"}
                      />
                      {query.trim().length >= 2 ? (
                        <ul className="mt-2 divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white text-sm dark:divide-white/10 dark:border-white/10 dark:bg-[#0b1220]">
                          {results.length === 0 ? (
                            <li className="p-3 text-slate-500">Brak wyników.</li>
                          ) : (
                            results.map((item) => (
                              <li key={item.id}>
                                <button
                                  type="button"
                                  onClick={() => setRecipient(item)}
                                  className="flex w-full items-center justify-between gap-3 p-3 text-left hover:bg-slate-50 dark:hover:bg-white/5"
                                >
                                  <span className="min-w-0">
                                    <span className="block truncate font-medium text-slate-900 dark:text-white">{item.name}</span>
                                    <span className="text-xs text-slate-500">{item.phone ?? "brak telefonu"}</span>
                                  </span>
                                  <span className={"shrink-0 text-xs " + (item.devices > 0 ? "text-emerald-700 dark:text-emerald-300" : "text-slate-400")}>
                                    {item.devices > 0 ? "powiadomienia włączone" : "bez powiadomień"}
                                  </span>
                                </button>
                              </li>
                            ))
                          )}
                        </ul>
                      ) : null}
                    </>
                  )}
                </div>
              ) : null}

              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-white">Gotowe treści</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {TEMPLATES.map((template) => (
                    <button
                      key={template.label}
                      type="button"
                      onClick={() => {
                        setTitle(template.title);
                        setBody(template.body);
                      }}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
                    >
                      {template.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label htmlFor="push-title" className="flex justify-between text-sm font-semibold text-slate-900 dark:text-white">
                  Tytuł <span className="font-normal text-slate-400">{title.length}/{TITLE_MAX}</span>
                </label>
                <input
                  id="push-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={TITLE_MAX}
                  required
                  className={INPUT + " mt-2 h-11"}
                />
              </div>
              <div>
                <label htmlFor="push-body" className="flex justify-between text-sm font-semibold text-slate-900 dark:text-white">
                  Treść <span className="font-normal text-slate-400">{body.length}/{BODY_MAX}</span>
                </label>
                <textarea
                  id="push-body"
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  maxLength={BODY_MAX}
                  required
                  rows={3}
                  className={INPUT + " mt-2 py-3"}
                />
                <p className="mt-1 text-xs text-slate-400">
                  Powiadomienie widać na zablokowanym ekranie telefonu — nie wpisuj nazwy zabiegu ani danych medycznych.
                </p>
              </div>

              <button
                type="submit"
                disabled={sending || title.trim().length < 2 || body.trim().length < 2 || (audience === "patient" && !recipient)}
                className={PRIMARY_BUTTON}
              >
                {sending ? "Wysyłanie…" : "Wyślij powiadomienie"}
              </button>
            </form>
          </section>

          <section className={SECTION}>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Powiadomienia automatyczne</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Te same zdarzenia co przy e-mailach, z osobnymi przełącznikami. Zmiana zapisuje się od razu.
            </p>
            {(["PATIENT", "STAFF"] as const).map((group) => (
              <div key={group} className="mt-5">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {group === "PATIENT" ? "Do klientów" : "Do personelu"}
                </div>
                <ul className="mt-2 divide-y divide-slate-100 dark:divide-white/10">
                  {EMAIL_TYPE_INFO.filter((info) => info.toggleable && info.audience === group).map((info) => (
                    <li key={info.type} className="flex items-start justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900 dark:text-white">{info.label}</div>
                        <div className="text-sm text-slate-500 dark:text-slate-400">{info.description}</div>
                      </div>
                      <Toggle
                        label={info.label}
                        checked={!disabled.includes(info.type)}
                        onChange={(enabled) => toggleType(info.type, enabled)}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <p className="mt-3 text-xs text-slate-400">
              Do personelu: administratorzy, recepcja z lokalizacji wizyty oraz specjalista, którego dotyczy rezerwacja
              (jeśli w ustawieniach poczty włączone jest „Powiadamiaj specjalistę”).
            </p>
          </section>

          <section className={SECTION}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Dziennik powiadomień</h2>
              <button type="button" onClick={() => load()} className="text-sm text-emerald-700 hover:underline dark:text-emerald-300">
                Odśwież
              </button>
            </div>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Ostatnie 50 powiadomień.</p>
            {logs.length === 0 ? (
              <p className="mt-4 rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-500 dark:border-white/10">
                Nie wysłano jeszcze żadnego powiadomienia.
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-slate-100 dark:divide-white/10">
                {logs.map((log) => (
                  <li key={log.id} className="py-3">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <StatusPill status={log.status} />
                      <span className="text-sm font-semibold text-slate-900 dark:text-white">{emailTypeLabel(log.type)}</span>
                      <span className="text-xs text-slate-400">{formatDateTime(log.createdAt)}</span>
                    </div>
                    <div className="mt-1 break-words text-sm text-slate-600 dark:text-slate-300">{log.recipient}</div>
                    <div className="mt-0.5 break-words text-sm text-slate-500 dark:text-slate-400">{log.subject}</div>
                    {log.error ? <div className="mt-1 break-words text-sm text-red-700 dark:text-red-300">{log.error}</div> : null}
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
