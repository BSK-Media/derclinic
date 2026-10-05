"use client";

import * as React from "react";
import { useFacebookLoginEnabled } from "@/components/facebook-login-button";

// Przycisk logowania pacjenta przez Google (panel klienta i rezerwacja online).
// To zwykły odnośnik do /api/patient/google/start — cały przepływ OAuth dzieje
// się po stronie serwera (patrz lib/google-oauth.ts). Renderuje się tylko, gdy
// logowanie Google jest skonfigurowane na serwerze.

export const GOOGLE_ERROR_MESSAGES: Record<string, string> = {
  niedostepne: "Logowanie przez Google jest chwilowo niedostępne.",
  limit: "Zbyt wiele prób logowania. Spróbuj ponownie za kilka minut.",
  anulowano: "Logowanie przez Google zostało anulowane.",
  blad: "Nie udało się zalogować przez Google. Spróbuj ponownie.",
  "konto-istnieje":
    "Ten adres e-mail ma już konto. Zaloguj się dotychczasową metodą, a potem połącz konto z Google w zakładce „Dane klienta”.",
  zajete: "To konto Google jest już połączone z innym kontem w DerClinic.",
};

export function googleErrorMessage(code: string | null | undefined) {
  if (!code) return "";
  return GOOGLE_ERROR_MESSAGES[code] ?? GOOGLE_ERROR_MESSAGES.blad;
}

let enabledPromise: Promise<boolean> | null = null;

function loadEnabled() {
  enabledPromise ??= fetch("/api/patient/google/status")
    .then((r) => r.json())
    .then((result) => Boolean(result?.enabled))
    .catch(() => false);
  return enabledPromise;
}

export function useGoogleLoginEnabled() {
  const [enabled, setEnabled] = React.useState(false);
  React.useEffect(() => {
    let cancelled = false;
    loadEnabled().then((value) => {
      if (!cancelled) setEnabled(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return enabled;
}

export function GoogleLoginButton({
  returnTo,
  label = "Kontynuuj z Google",
  className = "",
}: {
  returnTo: string;
  label?: string;
  className?: string;
}) {
  const enabled = useGoogleLoginEnabled();
  if (!enabled) return null;
  return (
    <a
      href={`/api/patient/google/start?returnTo=${encodeURIComponent(returnTo)}`}
      className={
        "flex w-full items-center justify-center gap-2.5 rounded-xl border border-zinc-300 bg-white py-3 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50 " +
        className
      }
    >
      <svg viewBox="0 0 48 48" className="h-[18px] w-[18px] shrink-0" aria-hidden="true">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
      </svg>
      {label}
    </a>
  );
}

/** Separator "lub" między przyciskami Google/Facebook a formularzem z hasłem. */
export function GoogleLoginDivider() {
  const googleEnabled = useGoogleLoginEnabled();
  const facebookEnabled = useFacebookLoginEnabled();
  if (!googleEnabled && !facebookEnabled) return null;
  return (
    <div className="my-4 flex items-center gap-3 text-xs text-zinc-400">
      <span className="h-px flex-1 bg-zinc-200" />
      lub
      <span className="h-px flex-1 bg-zinc-200" />
    </div>
  );
}
