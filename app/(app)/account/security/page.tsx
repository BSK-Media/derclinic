"use client";

import React from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { startRegistration, browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/components/auth-provider";

// Ustawienia bezpieczeństwa własnego konta (audyt F-04, F-07). Operacje
// wrażliwe wymagają ponownego potwierdzenia MFA — okno pojawia się samo
// (components/security-fetch.tsx).

type SecurityState = {
  ok: boolean;
  mfaEnabledAt: string | null;
  totpEnabled: boolean;
  recoveryCodesRemaining: number;
  passkeys: { id: string; name: string; createdAt: string; lastUsedAt: string | null }[];
  sessions: {
    id: string;
    createdAt: string;
    lastSeenAt: string;
    ipAddress: string | null;
    userAgent: string | null;
    mfaMethod: string;
    current: boolean;
  }[];
};

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json());

const dateTime = (value: string | null) =>
  value ? new Date(value).toLocaleString("pl-PL", { dateStyle: "medium", timeStyle: "short" }) : "—";

function describeDevice(ua: string | null) {
  if (!ua) return "Nieznane urządzenie";
  const os = /iPhone|iPad/.test(ua)
    ? "iPhone/iPad"
    : /Android/.test(ua)
      ? "Android"
      : /Windows/.test(ua)
        ? "Windows"
        : /Mac OS/.test(ua)
          ? "macOS"
          : "Inny system";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
      ? "Chrome"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Safari\//.test(ua)
          ? "Safari"
          : "przeglądarka";
  return `${browser} · ${os}`;
}

async function postJson(url: string, body?: unknown, method = "POST") {
  const res = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return (await res.json().catch(() => ({}))) as any;
}

// Administrator: jednorazowe zaszyfrowanie danych medycznych zapisanych przed
// wdrożeniem szyfrowania (zdjęcia z wizyt, notatki).
function EncryptionBackfill() {
  const { data, mutate } = useSWR<{ ok: boolean; remaining: number }>("/api/admin/security/encrypt-backfill", fetcher);
  const [running, setRunning] = React.useState(false);

  async function runAll() {
    setRunning(true);
    try {
      let left = data?.remaining ?? 0;
      while (left > 0) {
        const result = await postJson("/api/admin/security/encrypt-backfill");
        if (!result.ok) return void toast.error(result.message || "Przerwano szyfrowanie");
        left = result.remaining;
        void mutate({ ok: true, remaining: left }, { revalidate: false });
        if (result.encrypted === 0) break;
      }
      toast.success("Wszystkie dane medyczne są zaszyfrowane");
    } finally {
      setRunning(false);
      void mutate();
    }
  }

  if (!data?.ok) return null;
  return (
    <Card className="space-y-3 p-5">
      <h2 className="text-lg font-semibold">Szyfrowanie danych medycznych</h2>
      <p className="text-sm text-zinc-600 dark:text-zinc-300">
        Nowe zdjęcia z wizyt i notatki są szyfrowane automatycznie.{" "}
        {data.remaining > 0
          ? `Do zaszyfrowania zostało ${data.remaining} starszych pól.`
          : "Wszystkie starsze dane są już zaszyfrowane."}
      </p>
      {data.remaining > 0 ? (
        <Button disabled={running} onClick={() => void runAll()}>
          {running ? "Szyfrowanie…" : "Zaszyfruj starsze dane"}
        </Button>
      ) : null}
    </Card>
  );
}

export default function AccountSecurityPage() {
  const { user } = useAuth();
  const { data, mutate } = useSWR<SecurityState>("/api/me/security", fetcher);
  const [recoveryCodes, setRecoveryCodes] = React.useState<string[] | null>(null);
  const [totpSetup, setTotpSetup] = React.useState<{ qrSvg: string; secret: string } | null>(null);
  const [totpCode, setTotpCode] = React.useState("");
  const [passkeyName, setPasskeyName] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
      void mutate();
    }
  }

  const regenerateCodes = () =>
    run(async () => {
      if (!confirm("Wygenerować nowe kody? Dotychczasowe kody przestaną działać.")) return;
      const result = await postJson("/api/me/security/recovery-codes");
      if (!result.ok) return void toast.error(result.message || "Nie udało się wygenerować kodów");
      setRecoveryCodes(result.recoveryCodes);
    });

  const startTotpChange = () =>
    run(async () => {
      const result = await postJson("/api/me/security/totp", { action: "setup" });
      if (!result.ok) return void toast.error(result.message || "Nie udało się przygotować kodu QR");
      setTotpCode("");
      setTotpSetup({ qrSvg: result.qrSvg, secret: result.secret });
    });

  const confirmTotpChange = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const result = await postJson("/api/me/security/totp", { action: "confirm", code: totpCode });
      if (!result.ok) return void toast.error(result.message || "Kod się nie zgadza");
      setTotpSetup(null);
      toast.success("Aplikacja uwierzytelniająca została zmieniona");
    });
  };

  const addPasskey = () =>
    run(async () => {
      const options = await postJson("/api/me/security/passkeys/options");
      if (!options.ok) return void toast.error(options.message || "Nie udało się rozpocząć dodawania klucza");
      let response;
      try {
        response = await startRegistration({ optionsJSON: options.options });
      } catch {
        return void toast.error("Anulowano albo urządzenie nie utworzyło klucza dostępu");
      }
      const result = await postJson("/api/me/security/passkeys", {
        name: passkeyName.trim() || describeDevice(navigator.userAgent),
        response,
      });
      if (!result.ok) return void toast.error(result.message || "Nie udało się dodać klucza");
      setPasskeyName("");
      toast.success("Dodano klucz dostępu");
    });

  const removePasskey = (id: string, name: string) =>
    run(async () => {
      if (!confirm(`Usunąć klucz dostępu „${name}”?`)) return;
      const result = await postJson(`/api/me/security/passkeys?id=${encodeURIComponent(id)}`, undefined, "DELETE");
      if (!result.ok) return void toast.error(result.message || "Nie udało się usunąć klucza");
      toast.success("Usunięto klucz dostępu");
    });

  const revokeOthers = () =>
    run(async () => {
      const result = await postJson("/api/me/security/sessions", undefined, "DELETE");
      if (!result.ok) return void toast.error("Nie udało się wylogować pozostałych urządzeń");
      toast.success(`Wylogowano pozostałe urządzenia (${result.revoked})`);
    });

  if (!data?.ok) {
    return <div className="p-6 text-sm text-zinc-500">Ładowanie…</div>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold">Bezpieczeństwo konta</h1>
        <p className="text-sm text-zinc-500">
          Logowanie dwuskładnikowe jest obowiązkowe dla wszystkich kont personelu.
        </p>
      </div>

      <Card className="space-y-3 p-5">
        <h2 className="text-lg font-semibold">Aplikacja uwierzytelniająca</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          {data.totpEnabled ? `Włączona od ${dateTime(data.mfaEnabledAt)}.` : "Nie skonfigurowano."} Nowy telefon?
          Przenieś logowanie na nową aplikację — stara działa do momentu potwierdzenia nowej.
        </p>
        {totpSetup ? (
          <form className="space-y-3" onSubmit={confirmTotpChange}>
            <div
              className="w-48 rounded-lg bg-white p-2"
              // SVG generowany po naszej stronie (biblioteka qrcode).
              dangerouslySetInnerHTML={{ __html: totpSetup.qrSvg }}
            />
            <p className="text-xs text-zinc-500">
              Klucz do wpisania ręcznie: <span className="select-all font-mono">{totpSetup.secret}</span>
            </p>
            <div className="flex gap-2">
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="Kod z nowej aplikacji"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
              />
              <Button type="submit" disabled={busy || !totpCode.trim()}>
                Potwierdź
              </Button>
              <Button type="button" variant="ghost" onClick={() => setTotpSetup(null)}>
                Anuluj
              </Button>
            </div>
          </form>
        ) : (
          <Button variant="outline" disabled={busy} onClick={() => void startTotpChange()}>
            Zmień aplikację / telefon
          </Button>
        )}
      </Card>

      <Card className="space-y-3 p-5">
        <h2 className="text-lg font-semibold">Klucze dostępu (passkeys)</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          Najbezpieczniejszy sposób logowania: Face ID, Touch ID, Windows Hello albo klucz sprzętowy. Działa tylko na
          prawdziwej stronie DerClinic, więc chroni przed podrobionymi stronami logowania.
        </p>
        {data.passkeys.length > 0 ? (
          <ul className="divide-y rounded-lg border">
            {data.passkeys.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                <div>
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-zinc-500">
                    Dodano {dateTime(p.createdAt)} · ostatnio użyty {dateTime(p.lastUsedAt)}
                  </div>
                </div>
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => void removePasskey(p.id, p.name)}>
                  Usuń
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-500">Brak kluczy dostępu.</p>
        )}
        {browserSupportsWebAuthn() ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1">
              <Label htmlFor="passkey-name">Nazwa (opcjonalnie)</Label>
              <Input
                id="passkey-name"
                placeholder="np. iPhone recepcji"
                value={passkeyName}
                onChange={(e) => setPasskeyName(e.target.value)}
              />
            </div>
            <Button disabled={busy} onClick={() => void addPasskey()}>
              Dodaj klucz dostępu
            </Button>
          </div>
        ) : (
          <p className="text-xs text-zinc-500">Ta przeglądarka nie obsługuje kluczy dostępu.</p>
        )}
      </Card>

      <Card className="space-y-3 p-5">
        <h2 className="text-lg font-semibold">Kody odzyskiwania</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          Pozostało <strong>{data.recoveryCodesRemaining}</strong> z 10 jednorazowych kodów. Użyj ich, gdy nie masz
          dostępu do telefonu.
        </p>
        {recoveryCodes ? (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2 rounded-lg border bg-zinc-50 p-3 font-mono text-sm dark:bg-zinc-900">
              {recoveryCodes.map((c) => (
                <span key={c} className="select-all text-center">
                  {c}
                </span>
              ))}
            </div>
            <p className="text-xs text-zinc-500">Zapisz je teraz — nie pokażemy ich ponownie.</p>
            <Button variant="outline" onClick={() => setRecoveryCodes(null)}>
              Zapisałem/am kody
            </Button>
          </div>
        ) : (
          <Button variant="outline" disabled={busy} onClick={() => void regenerateCodes()}>
            Wygeneruj nowe kody
          </Button>
        )}
      </Card>

      {user?.role === "ADMIN" ? <EncryptionBackfill /> : null}

      <Card className="space-y-3 p-5">
        <h2 className="text-lg font-semibold">Aktywne sesje</h2>
        <ul className="divide-y rounded-lg border">
          {data.sessions.map((s) => (
            <li key={s.id} className="p-3 text-sm">
              <div className="font-medium">
                {describeDevice(s.userAgent)} {s.current ? <span className="text-emerald-600">(to urządzenie)</span> : null}
              </div>
              <div className="text-xs text-zinc-500">
                Zalogowano {dateTime(s.createdAt)} · ostatnia aktywność {dateTime(s.lastSeenAt)}
                {s.ipAddress ? ` · IP ${s.ipAddress}` : ""}
              </div>
            </li>
          ))}
        </ul>
        <Button
          variant="outline"
          disabled={busy || data.sessions.filter((s) => !s.current).length === 0}
          onClick={() => void revokeOthers()}
        >
          Wyloguj pozostałe urządzenia
        </Button>
      </Card>
    </div>
  );
}
