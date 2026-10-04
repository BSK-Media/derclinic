import { createRemoteJWKSet, jwtVerify } from "jose";

// Logowanie pacjenta przez Google (OAuth 2.0 / OpenID Connect, przepływ
// "authorization code" z przekierowaniem — bez skryptów Google na stronie,
// więc CSP zostaje bez zmian).
//
//  1. /api/patient/google/start     — zapisuje jednorazowy stan w ciasteczku
//                                      i przekierowuje do Google,
//  2. /api/patient/google/callback  — wymienia kod na token, weryfikuje go
//                                      i zakłada sesję pacjenta.
//
// Zasady łączenia kont (adresy e-mail na kartach pacjentów NIE są przez nas
// potwierdzane, więc sam zgodny e-mail nie wystarcza do wejścia na cudzą kartę):
//  * znany googleSub              → logowanie na tę kartę,
//  * zalogowany pacjent           → dopięcie Google do JEGO konta,
//  * e-mail ma już konto z hasłem → odmowa; trzeba zalogować się hasłem
//                                   i połączyć konto z Google w panelu,
//  * w pozostałych przypadkach    → nowa karta (wcześniejszą kartę gościa
//                                   recepcja łączy w Pacjenci → Duplikaty).

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export const GOOGLE_STATE_COOKIE = "derclinic_google_oauth";
export const GOOGLE_STATE_TTL_SEC = 10 * 60;
export const GOOGLE_CALLBACK_PATH = "/api/patient/google/callback";

export type GoogleOAuthState = { state: string; nonce: string; returnTo: string };

export function googleOAuthConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/** Powrót wyłącznie na rezerwację albo do panelu klienta — nigdy na obcy adres. */
export function sanitizeReturnTo(value: string | null | undefined) {
  const fallback = "/panel-klienta";
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  const path = value.split(/[?#]/)[0];
  const allowed = path === "/book" || path === "/panel-klienta" || path.startsWith("/panel-klienta/");
  return allowed ? value.slice(0, 1000) : fallback;
}

export function encodeGoogleState(state: GoogleOAuthState) {
  return Buffer.from(JSON.stringify(state)).toString("base64url");
}

export function decodeGoogleState(value: string | undefined | null): GoogleOAuthState | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (typeof parsed?.state !== "string" || typeof parsed?.nonce !== "string" || typeof parsed?.returnTo !== "string") {
      return null;
    }
    return { state: parsed.state, nonce: parsed.nonce, returnTo: sanitizeReturnTo(parsed.returnTo) };
  } catch {
    return null;
  }
}

export function buildGoogleAuthUrl(input: { clientId: string; redirectUri: string; state: string; nonce: string }) {
  const url = new URL(AUTH_ENDPOINT);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", input.state);
  url.searchParams.set("nonce", input.nonce);
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

export type GoogleProfile = { sub: string; email: string; name: string | null };

/** Wymienia kod autoryzacyjny na token i zwraca zweryfikowany profil Google. */
export async function fetchGoogleProfile(input: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
  nonce: string;
}): Promise<GoogleProfile> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: input.code,
      client_id: input.clientId,
      client_secret: input.clientSecret,
      redirect_uri: input.redirectUri,
      grant_type: "authorization_code",
    }),
    cache: "no-store",
  });
  const tokens = await response.json().catch(() => null);
  if (!response.ok || typeof tokens?.id_token !== "string") {
    throw new Error(`Google nie wydał tokenu (${response.status}: ${tokens?.error ?? "brak id_token"})`);
  }

  const { payload } = await jwtVerify(tokens.id_token, GOOGLE_JWKS, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: input.clientId,
  });
  if (payload.nonce !== input.nonce) throw new Error("Niezgodny nonce w tokenie Google");
  if (typeof payload.sub !== "string" || typeof payload.email !== "string") {
    throw new Error("Token Google bez identyfikatora lub adresu e-mail");
  }
  if (payload.email_verified !== true) throw new Error("Adres e-mail konta Google nie jest potwierdzony");

  const name = typeof payload.name === "string" ? payload.name.replace(/\s+/g, " ").trim().slice(0, 200) : "";
  return { sub: payload.sub, email: payload.email.trim().toLowerCase().slice(0, 200), name: name || null };
}
