"use client";

import * as React from "react";

// Przycisk logowania pacjenta przez Facebooka (panel klienta i rezerwacja
// online) — odpowiednik components/google-login-button.tsx. To zwykły odnośnik
// do /api/patient/facebook/start; cały przepływ OAuth dzieje się po stronie
// serwera (patrz lib/facebook-oauth.ts). Renderuje się tylko, gdy logowanie
// przez Facebooka jest skonfigurowane na serwerze.

export const FACEBOOK_ERROR_MESSAGES: Record<string, string> = {
  niedostepne: "Logowanie przez Facebooka jest chwilowo niedostępne.",
  limit: "Zbyt wiele prób logowania. Spróbuj ponownie za kilka minut.",
  anulowano: "Logowanie przez Facebooka zostało anulowane.",
  blad: "Nie udało się zalogować przez Facebooka. Spróbuj ponownie.",
  "konto-istnieje":
    "Ten adres e-mail ma już konto. Zaloguj się dotychczasową metodą, a potem połącz konto z Facebookiem w zakładce „Dane klienta”.",
  zajete: "To konto Facebooka jest już połączone z innym kontem w DerClinic.",
};

export function facebookErrorMessage(code: string | null | undefined) {
  if (!code) return "";
  return FACEBOOK_ERROR_MESSAGES[code] ?? FACEBOOK_ERROR_MESSAGES.blad;
}

let enabledPromise: Promise<boolean> | null = null;

function loadEnabled() {
  enabledPromise ??= fetch("/api/patient/facebook/status")
    .then((r) => r.json())
    .then((result) => Boolean(result?.enabled))
    .catch(() => false);
  return enabledPromise;
}

export function useFacebookLoginEnabled() {
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

export function FacebookLoginButton({
  returnTo,
  label = "Kontynuuj z Facebookiem",
  className = "",
}: {
  returnTo: string;
  label?: string;
  className?: string;
}) {
  const enabled = useFacebookLoginEnabled();
  if (!enabled) return null;
  return (
    <a
      href={`/api/patient/facebook/start?returnTo=${encodeURIComponent(returnTo)}`}
      className={
        "flex w-full items-center justify-center gap-2.5 rounded-xl border border-zinc-300 bg-white py-3 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50 " +
        className
      }
    >
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] shrink-0" aria-hidden="true">
        <path
          fill="#1877F2"
          d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.413c0-3.026 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.971h-1.513c-1.491 0-1.956.931-1.956 1.886v2.264h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"
        />
      </svg>
      {label}
    </a>
  );
}
