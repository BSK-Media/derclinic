"use client";

import React from "react";
import { startAuthentication, browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

// Globalna warstwa bezpieczeństwa dla wszystkich wywołań fetch w aplikacji:
//  * dokleja token CSRF (nagłówek x-csrf-token z ciasteczka bsk_csrf) do
//    żądań zmieniających dane w obrębie tej samej strony (audyt F-13),
//  * gdy serwer odpowie STEP_UP_REQUIRED (operacja wysokiego ryzyka, audyt
//    F-04), pokazuje okno ponownego potwierdzenia MFA i — po sukcesie —
//    automatycznie ponawia pierwotne żądanie.
// Dzięki temu poszczególne ekrany nie muszą niczego z tego obsługiwać same.

const CSRF_COOKIE = "bsk_csrf";
const CSRF_HEADER = "x-csrf-token";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function readCookie(name: string) {
  const match = document.cookie.split("; ").find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

function isSameOrigin(input: RequestInfo | URL) {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  try {
    return new URL(url, window.location.href).origin === window.location.origin;
  } catch {
    return false;
  }
}

type StepUpRequest = { resolve: (ok: boolean) => void };
let requestStepUp: ((req: StepUpRequest) => void) | null = null;
let pendingStepUp: Promise<boolean> | null = null;

function askForStepUp(): Promise<boolean> {
  if (!requestStepUp) return Promise.resolve(false);
  // Kilka równoległych żądań czeka na jedno okno.
  pendingStepUp ??= new Promise<boolean>((resolve) => requestStepUp!({ resolve })).finally(() => {
    pendingStepUp = null;
  });
  return pendingStepUp;
}

let installed = false;

function installSecureFetch() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const originalFetch = window.fetch.bind(window);

  const withCsrf = (input: RequestInfo | URL, init?: RequestInit): RequestInit | undefined => {
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (SAFE_METHODS.has(method) || !isSameOrigin(input)) return init;
    const token = readCookie(CSRF_COOKIE);
    if (!token) return init;
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.set(CSRF_HEADER, token);
    return { ...init, headers };
  };

  const secureFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    let response = await originalFetch(input, withCsrf(input, init));
    if (response.status !== 403 || !isSameOrigin(input)) return response;

    const body = await response
      .clone()
      .json()
      .catch(() => null);
    if (body?.code === "CSRF") {
      // Ciasteczko CSRF mogło zostać ustawione dopiero tą odpowiedzią — jedna ponowna próba.
      return await originalFetch(input, withCsrf(input, init));
    }
    if (body?.code === "STEP_UP_REQUIRED") {
      const confirmed = await askForStepUp();
      if (confirmed) response = await originalFetch(input, withCsrf(input, init));
    }
    return response;
  };

  window.fetch = secureFetch as typeof window.fetch;
}

// Instalujemy jak najwcześniej — jeszcze przed pierwszym renderem komponentów.
if (typeof window !== "undefined") installSecureFetch();

export function SecurityFetchProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = React.useState<StepUpRequest | null>(null);
  const [mode, setMode] = React.useState<"code" | "recovery">("code");
  const [value, setValue] = React.useState("");
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    installSecureFetch();
    requestStepUp = (req) => {
      setMode("code");
      setValue("");
      setError("");
      setPending(req);
    };
    return () => {
      requestStepUp = null;
    };
  }, []);

  const finish = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
  };

  async function submit(payload: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/step-up", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) {
        setError(result?.message || "Nie udało się potwierdzić");
        return;
      }
      finish(true);
    } finally {
      setBusy(false);
    }
  }

  async function confirmWithPasskey() {
    setError("");
    const optionsResponse = await fetch("/api/auth/step-up/passkey-options", { method: "POST" });
    const optionsResult = await optionsResponse.json().catch(() => ({}));
    if (!optionsResult?.ok) {
      setError(optionsResult?.message || "Brak kluczy dostępu na tym koncie");
      return;
    }
    try {
      const passkeyResponse = await startAuthentication({ optionsJSON: optionsResult.options });
      await submit({ passkeyResponse });
    } catch {
      setError("Anulowano albo urządzenie nie potwierdziło klucza dostępu");
    }
  }

  return (
    <>
      {children}
      <Dialog open={pending !== null} onOpenChange={(open) => (!open ? finish(false) : undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Potwierdź, że to Ty</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-zinc-500">
            Ta operacja wymaga ponownego potwierdzenia tożsamości{" "}
            {mode === "code" ? "kodem z aplikacji uwierzytelniającej." : "jednym z kodów odzyskiwania."}
          </p>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void submit(mode === "code" ? { code: value } : { recoveryCode: value });
            }}
          >
            <Input
              autoFocus
              inputMode={mode === "code" ? "numeric" : "text"}
              autoComplete="one-time-code"
              placeholder={mode === "code" ? "123456" : "XXXXX-XXXXX"}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={busy || !value.trim()}>
              {busy ? "Sprawdzanie..." : "Potwierdź"}
            </Button>
          </form>
          <div className="flex flex-wrap justify-between gap-2 text-sm">
            <button
              type="button"
              className="text-zinc-500 underline"
              onClick={() => {
                setMode(mode === "code" ? "recovery" : "code");
                setValue("");
                setError("");
              }}
            >
              {mode === "code" ? "Użyj kodu odzyskiwania" : "Użyj kodu z aplikacji"}
            </button>
            {typeof window !== "undefined" && browserSupportsWebAuthn() ? (
              <button type="button" className="text-zinc-500 underline" onClick={() => void confirmWithPasskey()}>
                Użyj klucza dostępu
              </button>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
