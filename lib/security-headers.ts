// Nagłówki bezpieczeństwa i Content-Security-Policy (audyt F-14).
// Czyste funkcje (bez zależności od Next.js) — używane w proxy.ts i w testach.

// Strona rezerwacji może być osadzona na stronie kliniki (WordPress) — tylko stamtąd.
export const BOOKING_FRAME_ANCESTORS = ["https://derclinic.pl", "https://www.derclinic.pl"];

export function buildContentSecurityPolicy({
  nonce,
  pathname,
  isDev = false,
}: {
  nonce: string;
  pathname: string;
  isDev?: boolean;
}) {
  const frameAncestors = pathname === "/book" || pathname.startsWith("/book/")
    ? ["'self'", ...BOOKING_FRAME_ANCESTORS]
    : ["'none'"];

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // Skrypty wyłącznie z nonce generowanym per żądanie; 'strict-dynamic' pozwala
    // skryptom Next.js ładować własne fragmenty. W trybie dev React potrzebuje eval.
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(isDev ? ["'unsafe-eval'"] : [])],
    // Style inline są używane przez biblioteki UI (wykresy, powiadomienia) —
    // nie wykonują kodu, więc to akceptowalny kompromis.
    "style-src": ["'self'", "'unsafe-inline'"],
    // Zdjęcia z wizyt i awatary to data:/blob:, logo partnerów z https.
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", ...(isDev ? ["ws:"] : [])],
    "worker-src": ["'self'"],
    "manifest-src": ["'self'"],
    "frame-src": ["'none'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": frameAncestors,
  };
  const policy = Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
  return isDev ? policy : `${policy}; upgrade-insecure-requests`;
}

export function staticSecurityHeaders({ pathname, isProduction }: { pathname: string; isProduction: boolean }) {
  const embeddable = pathname === "/book" || pathname.startsWith("/book/");
  const headers: Record<string, string> = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy":
      "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), interest-cohort=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "X-DNS-Prefetch-Control": "off",
  };
  // Starsze przeglądarki nie znają frame-ancestors — dla nich X-Frame-Options.
  if (!embeddable) headers["X-Frame-Options"] = "DENY";
  // HSTS tylko na produkcji (na localhost zablokowałby http). Bez includeSubDomains,
  // bo inne subdomeny kliniki mogą nie mieć HTTPS.
  if (isProduction) headers["Strict-Transport-Security"] = "max-age=63072000";
  return headers;
}

/** Odpowiedzi API z danymi pacjentów nie mogą trafiać do cache przeglądarki/pośredników. */
export const API_NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };
