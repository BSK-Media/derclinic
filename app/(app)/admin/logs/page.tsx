"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { ChevronDown, Download, RefreshCw, ScrollText, ShieldCheck } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Card } from "@/components/ui/card";
import { APPOINTMENT_STATUS_LABELS } from "@/lib/appointment-status";
import {
  AUDIT_ACTION_LABELS,
  AUDIT_ENTITY_LABELS,
  auditActionLabel,
  auditActorLabel,
  auditEntityLabel,
} from "@/lib/audit-labels";
import { formatPLNFromGrosze } from "@/lib/money";

type LogRow = {
  id: string;
  createdAt: string;
  actorType: string;
  actorId: string | null;
  actorName: string | null;
  actorLogin: string | null;
  actorRole: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  summary: string | null;
  data: unknown;
  ipAddress: string | null;
  userAgent: string | null;
};

type LogsResponse = {
  ok: boolean;
  logs: LogRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json());

const WHO_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "Wszyscy" },
  { value: "role:ADMIN", label: "Administrator" },
  { value: "role:RECEPTION", label: "Recepcja" },
  { value: "role:SPECIALIST", label: "Specjalista" },
  { value: "type:PATIENT", label: "Pacjent (panel klienta)" },
  { value: "type:GUEST", label: "Gość (niezalogowany)" },
  { value: "type:SYSTEM", label: "System" },
];

const ACTION_OPTIONS = Object.entries(AUDIT_ACTION_LABELS).sort((a, b) => a[1].localeCompare(b[1], "pl"));
const ENTITY_OPTIONS = Object.entries(AUDIT_ENTITY_LABELS).sort((a, b) => a[1].localeCompare(b[1], "pl"));

const FIELD_LABELS: Record<string, string> = {
  status: "Status",
  approvalStatus: "Akceptacja",
  priceFinal: "Cena końcowa",
  priceEstimate: "Cena szacowana",
  note: "Notatka",
  startsAt: "Początek",
  endsAt: "Koniec",
  specialistId: "Specjalista (ID)",
  serviceId: "Zabieg (ID)",
  name: "Imię i nazwisko",
  phone: "Telefon",
  email: "E-mail",
  role: "Rola",
  login: "Login",
  payoutPercent: "Udział specjalisty (%)",
  locationId: "Lokalizacja (ID)",
  isVisible: "Widoczny publicznie",
  isAvailable: "Dostępny",
  amount: "Kwota",
  method: "Metoda płatności",
  quantity: "Ilość",
  sidebarPermissions: "Uprawnienia menu",
  rejectionReason: "Powód odrzucenia",
  deletionReason: "Powód usunięcia",
};

const MONEY_KEYS = new Set([
  "priceFinal",
  "priceEstimate",
  "amount",
  "previousAmount",
  "newAmount",
  "subtotal",
  "total",
  "discountAmount",
  "salePrice",
  "purchasePrice",
  "baseRate",
]);

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  timeZone: "Europe/Warsaw",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
};

function formatDateTime(value: string) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString("pl-PL", DATE_FORMAT);
}

function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Tak" : "Nie";
  if ((key === "status" || key === "approvalStatus") && typeof value === "string") {
    return APPOINTMENT_STATUS_LABELS[value] ?? value;
  }
  if (MONEY_KEYS.has(key) && typeof value === "number") return formatPLNFromGrosze(value);
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return formatDateTime(value);
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function actionTone(action: string) {
  if (action === "CREATE" || action === "REGISTER" || action === "BOOK" || action === "sale.create") {
    return "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300";
  }
  if (action === "DELETE" || action === "LOGIN_FAILED" || action === "REJECT") {
    return "bg-red-100 text-red-800 dark:bg-red-500/10 dark:text-red-300";
  }
  if (action === "UPDATE" || action === "APPROVE" || action === "CONSENT") {
    return "bg-sky-100 text-sky-800 dark:bg-sky-500/10 dark:text-sky-300";
  }
  return "bg-zinc-100 text-zinc-700 dark:bg-white/10 dark:text-zinc-200";
}

function ActionBadge({ action }: { action: string }) {
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${actionTone(action)}`}
    >
      {auditActionLabel(action)}
    </span>
  );
}

function description(log: LogRow) {
  return log.summary?.trim() || `${auditActionLabel(log.action)} — ${auditEntityLabel(log.entity)}`;
}

function LogDetails({ log }: { log: LogRow }) {
  const data = asRecord(log.data);
  const changes = asRecord(data?.changes);
  const changeEntries = changes ? Object.entries(changes) : [];
  const rest = data
    ? Object.fromEntries(Object.entries(data).filter(([key]) => key !== "changes"))
    : null;
  const hasRest = rest && Object.keys(rest).length > 0;

  return (
    <div className="space-y-3 text-sm">
      {changeEntries.length > 0 ? (
        <div>
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">Zmiany (przed → po)</div>
          <ul className="space-y-1.5">
            {changeEntries.map(([key, change]) => {
              const c = asRecord(change);
              return (
                <li key={key} className="rounded-xl bg-zinc-50 px-3 py-2 dark:bg-white/5">
                  <div className="text-xs font-medium text-zinc-500">{FIELD_LABELS[key] ?? key}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 break-words">
                    <span className="text-zinc-500 line-through">{formatValue(key, c?.from)}</span>
                    <span className="text-zinc-400">→</span>
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100">{formatValue(key, c?.to)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {hasRest ? (
        <div>
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">Szczegóły</div>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-zinc-50 p-3 text-xs text-zinc-800 dark:bg-white/5 dark:text-zinc-200">
            {JSON.stringify(rest, null, 2)}
          </pre>
        </div>
      ) : null}

      <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-xs text-zinc-500 sm:grid-cols-2">
        <div className="break-all">
          <dt className="inline font-medium">Dokładny czas: </dt>
          <dd className="inline">{formatDateTime(log.createdAt)}</dd>
        </div>
        <div className="break-all">
          <dt className="inline font-medium">Adres IP: </dt>
          <dd className="inline">{log.ipAddress ?? "—"}</dd>
        </div>
        <div className="break-all">
          <dt className="inline font-medium">Login / telefon: </dt>
          <dd className="inline">{log.actorLogin ?? "—"}</dd>
        </div>
        <div className="break-all">
          <dt className="inline font-medium">ID aktora: </dt>
          <dd className="inline">{log.actorId ?? "—"}</dd>
        </div>
        <div className="break-all">
          <dt className="inline font-medium">ID obiektu: </dt>
          <dd className="inline">{log.entityId ?? "—"}</dd>
        </div>
        <div className="break-all">
          <dt className="inline font-medium">ID wpisu: </dt>
          <dd className="inline">{log.id}</dd>
        </div>
        <div className="break-words sm:col-span-2">
          <dt className="inline font-medium">Przeglądarka / urządzenie: </dt>
          <dd className="inline">{log.userAgent ?? "—"}</dd>
        </div>
      </dl>
    </div>
  );
}

// Natywne pola formularza z czcionką 16 px na telefonie (mniejsza wywołuje
// automatyczne powiększanie strony w Safari na iOS) i jawnymi kolorami tekstu
// oraz tła — samo color-scheme nie wystarcza w trybie ciemnym na iOS.
const FIELD_CLASS =
  "h-11 w-full min-w-0 rounded-xl border border-zinc-200 bg-white px-3 text-base text-zinc-900 outline-none focus:border-emerald-400 dark:border-white/10 dark:bg-[#111827] dark:text-zinc-100 sm:h-10 sm:text-sm";

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-xs font-medium text-zinc-500">{label}</span>
      {children}
    </label>
  );
}

export default function LogsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [q, setQ] = React.useState("");
  const [debouncedQ, setDebouncedQ] = React.useState("");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [who, setWho] = React.useState("");
  const [action, setAction] = React.useState("");
  const [entity, setEntity] = React.useState("");
  const [pageSize, setPageSize] = React.useState(50);
  const [page, setPage] = React.useState(1);
  const [expanded, setExpanded] = React.useState<string | null>(null);

  const isAdmin = !loading && user?.role === "ADMIN";

  React.useEffect(() => {
    if (!loading && user && user.role !== "ADMIN") router.replace("/admin");
  }, [loading, user, router]);

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(q.trim()), 350);
    return () => clearTimeout(timer);
  }, [q]);

  // Każda zmiana filtra wraca na pierwszą stronę.
  React.useEffect(() => {
    setPage(1);
    setExpanded(null);
  }, [debouncedQ, from, to, who, action, entity, pageSize]);

  const filterParams = React.useMemo(() => {
    const params = new URLSearchParams();
    if (debouncedQ) params.set("q", debouncedQ);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (who.startsWith("role:")) params.set("role", who.slice(5));
    if (who.startsWith("type:")) params.set("actorType", who.slice(5));
    if (action) params.set("action", action);
    if (entity) params.set("entity", entity);
    return params;
  }, [debouncedQ, from, to, who, action, entity]);

  const listUrl = React.useMemo(() => {
    const params = new URLSearchParams(filterParams);
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    return `/api/admin/logs?${params.toString()}`;
  }, [filterParams, page, pageSize]);

  const csvUrl = React.useMemo(() => {
    const params = new URLSearchParams(filterParams);
    params.set("format", "csv");
    return `/api/admin/logs?${params.toString()}`;
  }, [filterParams]);

  const { data, isLoading, isValidating, mutate } = useSWR<LogsResponse>(isAdmin ? listUrl : null, fetcher, {
    keepPreviousData: true,
    revalidateOnFocus: false,
  });

  if (loading || !user || user.role !== "ADMIN") return null;

  const logs = data?.ok ? data.logs : [];
  const total = data?.ok ? data.total : 0;
  const pageCount = data?.ok ? data.pageCount : 1;
  const hasFilters = Boolean(q || from || to || who || action || entity);

  function clearFilters() {
    setQ("");
    setFrom("");
    setTo("");
    setWho("");
    setAction("");
    setEntity("");
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <ScrollText className="h-5 w-5 text-emerald-600" /> Logi
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Dziennik wszystkich zdarzeń w aplikacji: kto, co i kiedy zrobił (pracownicy, recepcja, administratorzy,
          pacjenci i osoby rezerwujące online).
        </p>
      </div>

      <div className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3.5 text-sm text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Widok tylko do odczytu, dostępny wyłącznie dla administratora. Wpisy są zapisywane na serwerze w chwili
          zdarzenia i nie można ich edytować ani usuwać z poziomu aplikacji — także po usunięciu konta osoby, której
          dotyczą.
        </span>
      </div>

      <Card className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-4">
            <FieldLabel label="Szukaj (osoba, opis, ID, adres IP)">
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="np. Kowalska, status wizyty, 192.168…"
                className={FIELD_CLASS}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
              />
            </FieldLabel>
          </div>
          <FieldLabel label="Od dnia">
            <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className={FIELD_CLASS} />
          </FieldLabel>
          <FieldLabel label="Do dnia">
            <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={FIELD_CLASS} />
          </FieldLabel>
          <FieldLabel label="Kto">
            <select value={who} onChange={(e) => setWho(e.target.value)} className={FIELD_CLASS}>
              {WHO_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </FieldLabel>
          <FieldLabel label="Akcja">
            <select value={action} onChange={(e) => setAction(e.target.value)} className={FIELD_CLASS}>
              <option value="">Wszystkie</option>
              {ACTION_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </FieldLabel>
          <FieldLabel label="Czego dotyczy">
            <select value={entity} onChange={(e) => setEntity(e.target.value)} className={FIELD_CLASS}>
              <option value="">Wszystko</option>
              {ENTITY_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </FieldLabel>
          <FieldLabel label="Wpisów na stronie">
            <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className={FIELD_CLASS}>
              {[25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </FieldLabel>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => mutate()}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-white/10 dark:bg-[#111827] dark:text-zinc-100 dark:hover:bg-white/5"
          >
            <RefreshCw className={`h-4 w-4 ${isValidating ? "animate-spin" : ""}`} /> Odśwież
          </button>
          <a
            href={csvUrl}
            download
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-white/10 dark:bg-[#111827] dark:text-zinc-100 dark:hover:bg-white/5"
          >
            <Download className="h-4 w-4" /> Eksport CSV
          </a>
          {hasFilters ? (
            <button
              type="button"
              onClick={clearFilters}
              className="h-10 rounded-xl px-3 text-sm font-medium text-zinc-600 underline underline-offset-2 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white"
            >
              Wyczyść filtry
            </button>
          ) : null}
          <span className="ml-auto text-sm text-zinc-500">
            {isLoading ? "Ładowanie…" : `${total.toLocaleString("pl-PL")} wpisów`}
          </span>
        </div>
      </Card>

      {data && !data.ok ? (
        <Card className="p-5 text-center text-sm text-red-600">Nie udało się wczytać logów. Spróbuj odświeżyć.</Card>
      ) : null}
      {!isLoading && data?.ok && logs.length === 0 ? (
        <Card className="p-5 text-center text-sm text-zinc-500">Brak wpisów dla wybranych filtrów.</Card>
      ) : null}

      {/* Telefon i wąskie ekrany: karty */}
      <div className="space-y-2.5 md:hidden">
        {logs.map((log) => {
          const open = expanded === log.id;
          return (
            <Card key={log.id} className="p-3.5">
              <button
                type="button"
                onClick={() => setExpanded(open ? null : log.id)}
                aria-expanded={open}
                className="w-full text-left"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-zinc-500">{formatDateTime(log.createdAt)}</span>
                  <ActionBadge action={log.action} />
                </div>
                <div className="mt-1.5 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {auditActorLabel(log)}
                </div>
                <div className="mt-0.5 break-words text-sm text-zinc-700 dark:text-zinc-300">{description(log)}</div>
                <div className="mt-1.5 flex items-center justify-between text-xs text-zinc-500">
                  <span>{auditEntityLabel(log.entity)}</span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
                </div>
              </button>
              {open ? (
                <div className="mt-3 border-t pt-3">
                  <LogDetails log={log} />
                </div>
              ) : null}
            </Card>
          );
        })}
      </div>

      {/* Komputer i tablet: tabela */}
      {logs.length > 0 ? (
        <Card className="hidden overflow-hidden p-0 md:block">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/5">
                <tr>
                  <th className="whitespace-nowrap px-3 py-2.5 font-medium">Kiedy</th>
                  <th className="px-3 py-2.5 font-medium">Kto</th>
                  <th className="px-3 py-2.5 font-medium">Akcja</th>
                  <th className="px-3 py-2.5 font-medium">Czego dotyczy</th>
                  <th className="px-3 py-2.5 font-medium">Opis</th>
                  <th className="w-10 px-3 py-2.5" aria-label="Szczegóły" />
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const open = expanded === log.id;
                  return (
                    <React.Fragment key={log.id}>
                      <tr
                        onClick={() => setExpanded(open ? null : log.id)}
                        className="cursor-pointer border-b align-top hover:bg-zinc-50 dark:hover:bg-white/5"
                      >
                        <td className="whitespace-nowrap px-3 py-2.5 text-xs text-zinc-600 dark:text-zinc-300">
                          {formatDateTime(log.createdAt)}
                        </td>
                        <td className="px-3 py-2.5 font-medium">{auditActorLabel(log)}</td>
                        <td className="px-3 py-2.5">
                          <ActionBadge action={log.action} />
                        </td>
                        <td className="px-3 py-2.5 text-zinc-600 dark:text-zinc-300">{auditEntityLabel(log.entity)}</td>
                        <td className="max-w-md break-words px-3 py-2.5 text-zinc-700 dark:text-zinc-200">
                          {description(log)}
                        </td>
                        <td className="px-3 py-2.5 text-zinc-400">
                          <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
                        </td>
                      </tr>
                      {open ? (
                        <tr className="border-b bg-zinc-50/60 dark:bg-white/[0.03]">
                          <td colSpan={6} className="px-4 py-3">
                            <LogDetails log={log} />
                          </td>
                        </tr>
                      ) : null}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {total > 0 ? (
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="h-10 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-800 disabled:opacity-40 dark:border-white/10 dark:bg-[#111827] dark:text-zinc-100"
          >
            ← Nowsze
          </button>
          <span className="text-sm text-zinc-500">
            Strona {page} z {pageCount}
          </span>
          <button
            type="button"
            disabled={page >= pageCount}
            onClick={() => setPage((p) => p + 1)}
            className="h-10 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-800 disabled:opacity-40 dark:border-white/10 dark:bg-[#111827] dark:text-zinc-100"
          >
            Starsze →
          </button>
        </div>
      ) : null}
    </div>
  );
}
