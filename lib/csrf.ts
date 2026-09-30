// Ochrona przed CSRF (audyt F-13) — czyste funkcje używane w proxy.ts.
//
// Dwie niezależne warstwy dla każdego żądania zmieniającego dane (POST/PUT/
// PATCH/DELETE) do /api:
//  1. Origin / Sec-Fetch-Site musi wskazywać na tę samą stronę (żądanie
//     z obcej domeny jest odrzucane, nawet jeśli przeglądarka dołączy ciasteczka),
//  2. token "double submit": losowa wartość w ciasteczku bsk_csrf musi być
//     odesłana w nagłówku x-csrf-token — obca strona nie może odczytać
//     ciasteczka, więc nie zna tokenu. Nagłówek dokleja automatycznie
//     components/security-fetch.tsx do każdego fetch w obrębie aplikacji.

export const CSRF_COOKIE = "bsk_csrf";
export const CSRF_HEADER = "x-csrf-token";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function isMutation(method: string) {
  return !SAFE_METHODS.has(method.toUpperCase());
}

export type CsrfCheckInput = {
  method: string;
  requestOrigin: string; // np. https://panel.derclinic.pl (z nagłówków Host/X-Forwarded-*)
  originHeader: string | null;
  refererHeader: string | null;
  secFetchSite: string | null;
  cookieToken: string | null | undefined;
  headerToken: string | null;
};

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function originOf(url: string | null) {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** Zwraca powód odrzucenia albo null, gdy żądanie jest dozwolone. */
export function csrfRejectionReason(input: CsrfCheckInput): string | null {
  if (!isMutation(input.method)) return null;

  if (input.secFetchSite && !["same-origin", "none"].includes(input.secFetchSite)) {
    return "cross_site_fetch";
  }
  const origin = originOf(input.originHeader) ?? originOf(input.refererHeader);
  if (origin && origin !== input.requestOrigin) return "origin_mismatch";

  if (!input.cookieToken || !input.headerToken) return "missing_token";
  if (!constantTimeEqual(input.cookieToken, input.headerToken)) return "token_mismatch";
  return null;
}
