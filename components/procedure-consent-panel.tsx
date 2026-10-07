"use client";

import * as React from "react";
import useSWR from "swr";
import { AlertTriangle, CheckCircle2, Clock, Download, FileSignature, Upload } from "lucide-react";

type ConsentInfo = {
  ok: boolean;
  message?: string;
  appointment: {
    serviceName: string;
    specialistName: string;
    locationName: string | null;
    startsAt: string;
    canceled: boolean;
    forfeited: boolean;
  };
  consent: {
    status: "NOT_REQUIRED" | "NOT_SIGNED" | "PENDING_REVIEW" | "SIGNED";
    statusLabel: string;
    signedAt: string | null;
    rejectionReason: string | null;
    deadline: string;
    canUpload: boolean;
    blockedReason: string | null;
    warning: string;
    govSignUrl: string;
  };
};

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json());

function formatDeadline(iso: string) {
  return new Date(iso).toLocaleString("pl-PL", {
    timeZone: "Europe/Warsaw",
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Zgoda pacjenta na zabieg: pobranie PDF, podpisanie online (podpis zaufany
// na gov.pl) i wgranie podpisanego pliku — z wynikiem automatycznej weryfikacji.
// Używana po rezerwacji, na stronie z linku (mail / push) i w panelu klienta.
export function ProcedureConsentPanel({
  token,
  onDone,
  onLater,
}: {
  token: string;
  onDone?: () => void;
  // "Wgraj później": gdy podane (np. zalogowany pacjent), zamiast komunikatu
  // następuje przejście dalej, np. do panelu klienta.
  onLater?: () => void;
}) {
  const base = `/api/consent/${encodeURIComponent(token)}`;
  const { data, mutate, isLoading } = useSWR<ConsentInfo>(base, fetcher);

  const [showUpload, setShowUpload] = React.useState(false);
  const [later, setLaterState] = React.useState(false);
  const laterRef = React.useRef<HTMLParagraphElement | null>(null);
  const setLater = React.useCallback(
    (value: boolean) => {
      if (value && onLater) return onLater();
      setLaterState(value);
      // Komunikat pojawia się pod przyciskami — przewijamy do niego, żeby było widać reakcję.
      if (value) setTimeout(() => laterRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
    },
    [onLater],
  );
  const [file, setFile] = React.useState<File | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [result, setResult] = React.useState<{ outcome: string; reason: string | null; signer: string | null } | null>(null);

  async function upload() {
    if (!file) return;
    setError("");
    setResult(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${base}/upload`, { method: "POST", body: form });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out?.ok) {
        setError(out?.message || "Nie udało się wysłać pliku. Spróbuj ponownie.");
        return;
      }
      setResult({ outcome: out.outcome, reason: out.reason, signer: out.signer });
      setFile(null);
      await mutate();
      if (out.outcome !== "REJECTED") onDone?.();
    } catch {
      setError("Nie udało się połączyć z serwerem. Spróbuj ponownie.");
    } finally {
      setUploading(false);
    }
  }

  if (isLoading) return <div className="text-sm text-zinc-500">Ładowanie…</div>;
  if (!data?.ok) return <div className="text-sm text-red-600">{data?.message || "Nie udało się wczytać zgody."}</div>;

  const { appointment, consent } = data;

  if (consent.status === "NOT_REQUIRED") {
    return <div className="rounded-xl bg-zinc-50 p-4 text-sm text-zinc-600">Do tej wizyty zgoda nie jest wymagana.</div>;
  }

  if (appointment.canceled) {
    return (
      <div className="flex items-start gap-3 rounded-2xl border-2 border-red-300 bg-red-50 p-4 text-red-900">
        <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0" />
        <div className="text-sm">
          <div className="font-semibold">Rezerwacja anulowana</div>
          {appointment.forfeited
            ? "Zgoda na zabieg nie została podpisana do chwili zabiegu, więc rezerwacja została anulowana, a zaliczka przepadła."
            : "Ta rezerwacja została anulowana."}
        </div>
      </div>
    );
  }

  if (consent.status === "SIGNED") {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-green-300 bg-green-50 p-4 text-green-900">
        <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0" />
        <div className="text-sm">
          <div className="font-semibold">Zgoda na zabieg podpisana</div>
          {result?.signer ? `Podpisał(a): ${result.signer}. ` : ""}Dziękujemy — nic więcej nie musisz robić.
        </div>
      </div>
    );
  }

  if (consent.status === "PENDING_REVIEW") {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-blue-300 bg-blue-50 p-4 text-blue-900">
        <Clock className="mt-0.5 h-6 w-6 shrink-0" />
        <div className="text-sm">
          <div className="font-semibold">Zgoda czeka na weryfikację</div>
          Dokument został przesłany. Recepcja sprawdzi go i potwierdzi — dostaniesz informację. Jeśli to potrwa, nic
          więcej nie musisz robić.
        </div>
      </div>
    );
  }

  // NOT_SIGNED
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-2xl border-2 border-amber-400 bg-amber-50 p-4 text-amber-950">
        <AlertTriangle className="mt-0.5 h-7 w-7 shrink-0 text-amber-600" />
        <div className="text-sm">
          <div className="text-base font-bold">Zgoda na zabieg nie jest podpisana</div>
          <p className="mt-1">
            Podpisz ją i wgraj do systemu najpóźniej do <strong>{formatDeadline(consent.deadline)}</strong> (chwila
            rozpoczęcia zabiegu).
          </p>
          <p className="mt-2 font-semibold text-red-700">{consent.warning}</p>
        </div>
      </div>

      {consent.rejectionReason ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          Ostatnio przesłany plik został odrzucony: {consent.rejectionReason} Wgraj poprawny, podpisany dokument.
        </div>
      ) : null}

      <ol className="space-y-3 text-sm text-zinc-700">
        <li className="rounded-2xl border border-zinc-200 bg-white p-4">
          <div className="mb-2 font-semibold text-zinc-900">1. Pobierz zgodę do podpisania</div>
          <a
            href={`${base}/document`}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
          >
            <Download className="h-4 w-4" /> Pobierz zgodę (PDF)
          </a>
        </li>
        <li className="rounded-2xl border border-zinc-200 bg-white p-4">
          <div className="mb-1 font-semibold text-zinc-900">2. Podpisz dokument</div>
          <p className="mb-2 text-xs text-zinc-500">
            Najprościej podpisem zaufanym (darmowy, przez login do banku lub Profil Zaufany). Wybierz format{" "}
            <strong>PAdES (PDF)</strong>, a po podpisaniu pobierz plik na dysk.
          </p>
          <a
            href={consent.govSignUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-emerald-600 px-4 py-2.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50"
          >
            <FileSignature className="h-4 w-4" /> Podpisz dokument online
          </a>
        </li>
        <li className="rounded-2xl border border-zinc-200 bg-white p-4">
          <div className="mb-2 font-semibold text-zinc-900">3. Wgraj podpisany plik</div>
          {!showUpload ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowUpload(true);
                  setLater(false);
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
              >
                <Upload className="h-4 w-4" /> Wgraj podpisaną zgodę
              </button>
              <button
                type="button"
                onClick={() => setLater(true)}
                className="rounded-xl border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
              >
                Wgraj później
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <input
                type="file"
                accept="application/pdf,.pdf,.xml,.xades"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-emerald-700"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={upload}
                  disabled={!file || uploading}
                  className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                >
                  {uploading ? "Sprawdzanie podpisu…" : "Wyślij i sprawdź podpis"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowUpload(false);
                    setLater(true);
                  }}
                  disabled={uploading}
                  className="rounded-xl border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
                >
                  Wgraj później
                </button>
              </div>
            </div>
          )}

          {later ? (
            <p ref={laterRef} className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
              W porządku — możesz to zrobić później w panelu klienta (przy tej wizycie) albo z linku w mailu. Pamiętaj:
              {" "}
              {consent.warning.charAt(0).toLowerCase() + consent.warning.slice(1)} Przypomnimy Ci o tym dwa razy dziennie
              do dnia zabiegu.
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="mt-3 text-sm text-red-600">
              {error}
            </p>
          ) : null}
          {result?.outcome === "REJECTED" ? (
            <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">
              Plik odrzucony: {result.reason} Wgraj poprawny, podpisany dokument.
            </p>
          ) : null}
        </li>
      </ol>
    </div>
  );
}
