"use client";

import * as React from "react";
import useSWR from "swr";
import { AlertTriangle, CheckCircle2, Clock, Copy, Landmark, Smartphone, CreditCard } from "lucide-react";
import { formatPLNFromGrosze } from "@/lib/money";

type PayInfo = {
  ok: boolean;
  message?: string;
  appointment: { serviceName: string; specialistName: string; startsAt: string; canceled: boolean };
  request: {
    status: "AWAITING" | "CLAIMED" | "CONFIRMED" | "REJECTED";
    amount: number;
    choice: string;
    method: "BLIK" | "TRANSFER" | "P24" | null;
    reference: string;
    rejectionReason: string | null;
  } | null;
  methods: { key: "P24" | "BLIK" | "TRANSFER"; label: string; available: boolean; comingSoon: boolean }[];
  details: {
    transfer: { recipientName: string | null; bankName: string | null; account: string; accountRaw: string | null } | null;
    blik: { phone: string; phoneRaw: string | null } | null;
    note: string | null;
  };
};

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json());

const METHOD_ICONS = { P24: CreditCard, BLIK: Smartphone, TRANSFER: Landmark } as const;

function CopyField({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-3 py-2.5">
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wide text-zinc-400">{label}</div>
        <div className={"break-all text-sm font-semibold text-zinc-900 " + (mono ? "font-mono" : "")}>{value}</div>
      </div>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard
            ?.writeText(value)
            .then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            })
            .catch(() => null);
        }}
        className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-50"
      >
        <Copy className="h-3.5 w-3.5" /> {copied ? "Skopiowano" : "Kopiuj"}
      </button>
    </div>
  );
}

// Płatność za wizytę: wybór metody (Przelewy24 wkrótce; BLIK na telefon i
// przelew tradycyjny — ręcznie), instrukcja z tytułem płatności i przycisk
// „Dokonałem płatności". Płatność jest uznana dopiero po potwierdzeniu przez
// administratora kliniki.
export function PaymentRequestPanel({
  token,
  redirectAfterClaim,
}: {
  token: string;
  // Dokąd przejść po zgłoszeniu wpłaty (np. panel klienta dla zalogowanego klienta).
  redirectAfterClaim?: string | null;
}) {
  const base = `/api/pay/${encodeURIComponent(token)}`;
  const { data, mutate, isLoading } = useSWR<PayInfo>(base, fetcher);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  async function post(path: string, body?: unknown) {
    setError("");
    setBusy(true);
    try {
      const res = await fetch(`${base}/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out?.ok) {
        setError(out?.message || "Nie udało się zapisać. Spróbuj ponownie.");
        return false;
      }
      await mutate();
      return true;
    } catch {
      setError("Nie udało się połączyć z serwerem. Spróbuj ponownie.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function claim() {
    if (await post("claim") && redirectAfterClaim) window.location.href = redirectAfterClaim;
  }

  if (isLoading) return <div className="text-sm text-zinc-500">Ładowanie…</div>;
  if (!data?.ok) return <div className="text-sm text-red-600">{data?.message || "Nie udało się wczytać płatności."}</div>;

  const { request } = data;
  if (!request) return <div className="rounded-xl bg-zinc-50 p-4 text-sm text-zinc-600">Do tej wizyty nie ma płatności do uregulowania.</div>;
  if (data.appointment.canceled) {
    return <div className="rounded-xl bg-red-50 p-4 text-sm text-red-800">Ta rezerwacja została anulowana.</div>;
  }

  const amountText = formatPLNFromGrosze(request.amount);

  if (request.status === "CONFIRMED") {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-green-300 bg-green-50 p-4 text-green-900">
        <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0" />
        <div className="text-sm">
          <div className="font-semibold">Płatność potwierdzona</div>
          Zaksięgowaliśmy wpłatę {amountText}. Dziękujemy!
        </div>
      </div>
    );
  }

  if (request.status === "CLAIMED") {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-blue-300 bg-blue-50 p-4 text-blue-900">
        <Clock className="mt-0.5 h-6 w-6 shrink-0" />
        <div className="text-sm">
          <div className="font-semibold">Płatność oczekuje na potwierdzenie</div>
          Zgłosiłaś/eś wpłatę {amountText} (tytuł <span className="font-mono font-semibold">{request.reference}</span>).
          Gdy klinika zobaczy ją na koncie, potwierdzi płatność, a Ty dostaniesz powiadomienie.
        </div>
      </div>
    );
  }

  // AWAITING / REJECTED
  const chosen = request.method;
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-200 bg-white p-4">
        <div className="text-xs uppercase tracking-wide text-zinc-400">Do zapłaty teraz</div>
        <div className="text-2xl font-bold text-emerald-700">{amountText}</div>
        <div className="text-xs text-zinc-500">
          {request.choice === "FULL" ? "Pełna przedpłata" : "Zaliczka 10%"} · {data.appointment.serviceName}
        </div>
      </div>

      {request.status === "REJECTED" ? (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Poprzednia płatność nie została potwierdzona
            {request.rejectionReason ? `: ${request.rejectionReason}` : ""}. Sprawdź dane i zgłoś płatność ponownie.
          </span>
        </div>
      ) : null}

      <div>
        <div className="mb-2 text-sm font-semibold text-zinc-900">Wybierz metodę płatności</div>
        <div className="grid gap-2">
          {data.methods.map((method) => {
            const Icon = METHOD_ICONS[method.key];
            const disabled = !method.available || busy;
            const selected = chosen === method.key;
            return (
              <button
                key={method.key}
                type="button"
                disabled={disabled}
                onClick={() => void post("method", { method: method.key })}
                className={
                  "flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left text-sm transition " +
                  (selected
                    ? "border-emerald-500 bg-emerald-50"
                    : method.available
                      ? "border-zinc-200 bg-white hover:bg-zinc-50"
                      : "cursor-not-allowed border-zinc-200 bg-zinc-50 opacity-60")
                }
              >
                <Icon className="h-5 w-5 shrink-0 text-emerald-700" />
                <span className="flex-1 font-medium text-zinc-900">{method.label}</span>
                {method.comingSoon ? (
                  <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[11px] font-medium text-zinc-600">wkrótce</span>
                ) : !method.available ? (
                  <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[11px] font-medium text-zinc-600">niedostępne</span>
                ) : selected ? (
                  <span className="text-xs font-semibold text-emerald-700">wybrano</span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {chosen === "BLIK" && data.details.blik ? (
        <div className="space-y-2 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
          <div className="text-sm font-semibold text-zinc-900">Płatność BLIK na telefon</div>
          <p className="text-xs text-zinc-600">
            W aplikacji swojego banku wybierz „Przelew na telefon BLIK” i wyślij kwotę na numer poniżej. W tytule wpisz
            dokładnie podany kod — dzięki niemu rozpoznamy Twoją wpłatę.
          </p>
          <CopyField label="Numer telefonu (BLIK)" value={data.details.blik.phone} />
          <CopyField label="Kwota" value={amountText} mono={false} />
          <CopyField label="Tytuł płatności" value={request.reference} />
        </div>
      ) : null}

      {chosen === "TRANSFER" && data.details.transfer ? (
        <div className="space-y-2 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
          <div className="text-sm font-semibold text-zinc-900">Przelew tradycyjny</div>
          <p className="text-xs text-zinc-600">
            Prosimy o przelew na poniższe dane. <strong>Tytuł przelewu musi być dokładnie taki</strong>, jak podany
            kod — po nim potwierdzamy wpłatę.
          </p>
          {data.details.transfer.recipientName ? (
            <CopyField label="Odbiorca" value={data.details.transfer.recipientName} mono={false} />
          ) : null}
          {data.details.transfer.bankName ? (
            <div className="px-1 text-xs text-zinc-500">Bank: {data.details.transfer.bankName}</div>
          ) : null}
          <CopyField label="Numer konta" value={data.details.transfer.account} />
          <CopyField label="Kwota" value={amountText} mono={false} />
          <CopyField label="Tytuł przelewu" value={request.reference} />
        </div>
      ) : null}

      {data.details.note && chosen ? <p className="text-xs text-zinc-500">{data.details.note}</p> : null}

      {chosen === "BLIK" || chosen === "TRANSFER" ? (
        <div className="space-y-2">
          <button
            type="button"
            onClick={claim}
            disabled={busy}
            className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
          >
            {busy ? "Zapisywanie…" : "Dokonałem/am płatności"}
          </button>
          <p className="text-center text-[11px] text-zinc-400">
            Kliknij dopiero po wykonaniu przelewu. Płatność będzie uznana po potwierdzeniu przez klinikę.
          </p>
        </div>
      ) : (
        <p className="text-xs text-zinc-500">Wybierz metodę, aby zobaczyć dane do płatności.</p>
      )}

      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
