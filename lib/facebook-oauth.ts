import { createHmac } from "node:crypto";

// Logowanie pacjenta przez Facebooka (OAuth 2.0, przepływ "authorization code"
// z przekierowaniem — bez skryptów Facebooka na stronie, więc CSP zostaje bez
// zmian). Działa tak samo jak logowanie przez Google (lib/google-oauth.ts),
// z którego bierzemy też stan w ciasteczku i kontrolę adresu powrotu:
//
//  1. /api/patient/facebook/start     — zapisuje jednorazowy stan w ciasteczku
//                                        i przekierowuje do Facebooka,
//  2. /api/patient/facebook/callback  — wymienia kod na token, pobiera profil
//                                        i zakłada sesję pacjenta.
//
// Zasady łączenia kont są te same co przy Google:
//  * znany facebookId             → logowanie na tę kartę,
//  * zalogowany pacjent           → dopięcie Facebooka do JEGO konta,
//  * e-mail ma już konto          → odmowa; trzeba zalogować się dotychczasową
//                                   metodą i połączyć konto w panelu,
//  * w pozostałych przypadkach    → nowa karta (wcześniejszą kartę gościa
//                                   recepcja łączy w Pacjenci → Duplikaty).
//
// Różnica względem Google: Facebook nie zawsze podaje adres e-mail (konto
// założone na numer telefonu albo odmowa udostępnienia) — karta powstaje wtedy
// bez e-maila, a klient uzupełnia go przy pierwszej rezerwacji.

// Wersja Graph API. Po wygaśnięciu wersji Facebook sam obsługuje żądania
// najstarszą dostępną, więc logowanie nie przestaje działać z dnia na dzień.
const GRAPH_VERSION = "v24.0";
const AUTH_ENDPOINT = `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`;
const TOKEN_ENDPOINT = `https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`;
const PROFILE_ENDPOINT = `https://graph.facebook.com/${GRAPH_VERSION}/me`;

export const FACEBOOK_STATE_COOKIE = "derclinic_facebook_oauth";
export const FACEBOOK_STATE_TTL_SEC = 10 * 60;
export const FACEBOOK_CALLBACK_PATH = "/api/patient/facebook/callback";

export function facebookOAuthConfig() {
  const appId = process.env.FACEBOOK_APP_ID?.trim();
  const appSecret = process.env.FACEBOOK_APP_SECRET?.trim();
  return appId && appSecret ? { appId, appSecret } : null;
}

export function buildFacebookAuthUrl(input: { appId: string; redirectUri: string; state: string }) {
  const url = new URL(AUTH_ENDPOINT);
  url.searchParams.set("client_id", input.appId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "public_profile,email");
  url.searchParams.set("state", input.state);
  return url.toString();
}

export type FacebookProfile = { id: string; email: string | null; name: string | null };

/** Wymienia kod autoryzacyjny na token i zwraca profil użytkownika Facebooka. */
export async function fetchFacebookProfile(input: {
  appId: string;
  appSecret: string;
  redirectUri: string;
  code: string;
}): Promise<FacebookProfile> {
  const tokenUrl = new URL(TOKEN_ENDPOINT);
  tokenUrl.searchParams.set("client_id", input.appId);
  tokenUrl.searchParams.set("client_secret", input.appSecret);
  tokenUrl.searchParams.set("redirect_uri", input.redirectUri);
  tokenUrl.searchParams.set("code", input.code);
  const tokenResponse = await fetch(tokenUrl, { cache: "no-store" });
  const tokens = await tokenResponse.json().catch(() => null);
  if (!tokenResponse.ok || typeof tokens?.access_token !== "string") {
    throw new Error(
      `Facebook nie wydał tokenu (${tokenResponse.status}: ${tokens?.error?.message ?? "brak access_token"})`,
    );
  }
  const accessToken: string = tokens.access_token;

  // Token powstał z wymiany kodu z NASZYM sekretem, więc należy do naszej
  // aplikacji; appsecret_proof dodatkowo wiąże z nim zapytanie o profil.
  const profileUrl = new URL(PROFILE_ENDPOINT);
  profileUrl.searchParams.set("fields", "id,name,email");
  profileUrl.searchParams.set(
    "appsecret_proof",
    createHmac("sha256", input.appSecret).update(accessToken).digest("hex"),
  );
  const profileResponse = await fetch(profileUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const profile = await profileResponse.json().catch(() => null);
  if (!profileResponse.ok || typeof profile?.id !== "string" || !profile.id) {
    throw new Error(
      `Facebook nie zwrócił profilu (${profileResponse.status}: ${profile?.error?.message ?? "brak id"})`,
    );
  }

  const name = typeof profile.name === "string" ? profile.name.replace(/\s+/g, " ").trim().slice(0, 200) : "";
  const email = typeof profile.email === "string" ? profile.email.trim().toLowerCase().slice(0, 200) : "";
  return { id: profile.id, email: email.includes("@") ? email : null, name: name || null };
}
