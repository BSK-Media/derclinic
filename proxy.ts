import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  firstAllowedSidebarHref,
  hasSidebarPermission,
  normalizeSidebarPermissions,
  sidebarPermissionForPath,
  type SidebarPermission,
} from "./lib/sidebar-permissions";
import { validateStaffToken } from "./lib/session-core";
import { AUTH_COOKIE_NAME } from "./lib/auth-cookie";
import { CSRF_COOKIE, CSRF_HEADER, csrfRejectionReason } from "./lib/csrf";
import { API_NO_STORE_HEADERS, buildContentSecurityPolicy, staticSecurityHeaders } from "./lib/security-headers";

// Jedno miejsce kontroli dla każdego żądania:
//  * nagłówki bezpieczeństwa + CSP z nonce (audyt F-14),
//  * ochrona CSRF / kontrola Origin dla żądań zmieniających dane (F-13),
//  * sesja personelu weryfikowana w bazie — unieważniona sesja przestaje
//    działać natychmiast (F-07), a rola i uprawnienia pochodzą z bazy,
//  * autoryzacja sekcji panelu według roli i uprawnień menu.

type ProxyUser = { role: string; sidebarPermissions: SidebarPermission[] };

const IS_PRODUCTION = process.env.NODE_ENV === "production";

function requestOrigin(req: NextRequest) {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
  const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
  return `${proto}://${host}`;
}

function randomToken(bytes: number) {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return btoa(String.fromCharCode(...buffer)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function rejectAccess(req: NextRequest, user: ProxyUser) {
  if (req.nextUrl.pathname.startsWith("/api")) {
    return NextResponse.json({ ok: false, message: "Brak uprawnień" }, { status: 403 });
  }
  const url = req.nextUrl.clone();
  url.pathname = firstAllowedSidebarHref(user.role, user.sidebarPermissions);
  url.search = "";
  return NextResponse.redirect(url);
}

/** Decyzja autoryzacyjna: null = przepuść, w przeciwnym razie gotowa odpowiedź. */
async function authorize(req: NextRequest, requestHeaders: Headers): Promise<NextResponse | null> {
  const { pathname } = req.nextUrl;

  const needsAuth =
    pathname.startsWith("/admin") ||
    pathname.startsWith("/specialist") ||
    pathname.startsWith("/access-denied") ||
    pathname.startsWith("/account") ||
    pathname.startsWith("/api");
  if (!needsAuth) return null;

  // Logowanie (hasło + MFA) i publiczne API działają bez sesji personelu.
  if (
    pathname.startsWith("/api/auth/login") ||
    pathname.startsWith("/api/auth/logout") ||
    pathname.startsWith("/api/auth/change-password") ||
    pathname.startsWith("/api/auth/mfa/") ||
    pathname.startsWith("/api/public/") ||
    pathname.startsWith("/api/patient/") ||
    // Zadania cykliczne (Vercel Cron) — bez sesji, autoryzowane sekretem
    // CRON_SECRET sprawdzanym w samym endpoincie.
    pathname.startsWith("/api/cron/")
  ) {
    return null;
  }

  const session = await validateStaffToken(req.cookies.get(AUTH_COOKIE_NAME)?.value);
  if (!session) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ ok: false, message: "Brak autoryzacji" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  const role = session.user.role;
  const user: ProxyUser = {
    role,
    sidebarPermissions: normalizeSidebarPermissions(role, session.user.sidebarPermissions),
  };
  // Ustawienia własnego konta (MFA, sesje) — dla każdej roli personelu.
  if (pathname.startsWith("/access-denied") || pathname.startsWith("/account")) return null;

  const permission = sidebarPermissionForPath(pathname);

  // Specjalista korzysta z własnego dashboardu i własnej listy wizyt.
  // Nie otwieramy mu administracyjnej listy wszystkich wizyt.
  const specialistAdminAppointments =
    role === "SPECIALIST" &&
    (pathname === "/admin" ||
      pathname.startsWith("/admin/appointments") ||
      pathname.startsWith("/admin/visits") ||
      pathname.startsWith("/admin/calendar") ||
      pathname.startsWith("/admin/specialists") ||
      pathname.startsWith("/admin/locations") ||
      pathname.startsWith("/api/admin/appointments") ||
      pathname.startsWith("/api/admin/specialists") ||
      pathname.startsWith("/api/admin/locations") ||
      pathname.startsWith("/api/admin/consumption-adjustments"));
  if (specialistAdminAppointments) return rejectAccess(req, user);

  if (permission && !hasSidebarPermission(role, user.sidebarPermissions, permission)) {
    return rejectAccess(req, user);
  }

  // Nieznane podstrony administracyjne (np. zarządzanie kontami użytkowników)
  // pozostają zastrzeżone wyłącznie dla administratora.
  if ((pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) && !permission && role !== "ADMIN") {
    return rejectAccess(req, user);
  }

  if (pathname.startsWith("/specialist") || pathname.startsWith("/api/specialist")) {
    const receptionAppointments =
      role === "RECEPTION" &&
      (pathname.startsWith("/specialist/appointments") || pathname.startsWith("/api/specialist/appointments"));
    if (role !== "SPECIALIST" && role !== "ADMIN" && !receptionAppointments) {
      return rejectAccess(req, user);
    }
  }

  // Istniejące endpointy nadal kontrolują role. Ten nagłówek informuje je,
  // że sesja przyznała użytkownikowi dostęp do konkretnej sekcji.
  if (permission && pathname.startsWith("/api/admin") && role !== "ADMIN") {
    requestHeaders.set("x-bsk-sidebar-permission", permission);
  }
  return null;
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith("/api");

  // 1. CSRF / Origin dla żądań zmieniających dane.
  const csrfCookie = req.cookies.get(CSRF_COOKIE)?.value;
  if (isApi) {
    const reason = csrfRejectionReason({
      method: req.method,
      requestOrigin: requestOrigin(req),
      originHeader: req.headers.get("origin"),
      refererHeader: req.headers.get("referer"),
      secFetchSite: req.headers.get("sec-fetch-site"),
      cookieToken: csrfCookie,
      headerToken: req.headers.get(CSRF_HEADER),
    });
    if (reason) {
      return finalize(
        req,
        NextResponse.json(
          {
            ok: false,
            code: "CSRF",
            message: "Żądanie zablokowane ze względów bezpieczeństwa. Odśwież stronę i spróbuj ponownie.",
          },
          { status: 403 },
        ),
        null,
      );
    }
  }

  // 2. Nagłówki żądania przekazywane dalej: nigdy nie ufamy wewnętrznym
  //    nagłówkom przysłanym przez klienta; nonce dla CSP.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.delete("x-bsk-sidebar-permission");
  requestHeaders.delete("x-nonce");
  const nonce = isApi ? null : randomToken(16);
  const csp = nonce ? buildContentSecurityPolicy({ nonce, pathname, isDev: !IS_PRODUCTION }) : null;
  if (nonce && csp) {
    requestHeaders.set("x-nonce", nonce);
    // Next.js odczytuje nonce z tego nagłówka i dodaje go do własnych skryptów.
    requestHeaders.set("Content-Security-Policy", csp);
  }

  // 3. Autoryzacja.
  const denied = await authorize(req, requestHeaders);
  const response = denied ?? NextResponse.next({ request: { headers: requestHeaders } });
  return finalize(req, response, csp);
}

function finalize(req: NextRequest, response: NextResponse, csp: string | null) {
  const { pathname } = req.nextUrl;
  for (const [name, value] of Object.entries(staticSecurityHeaders({ pathname, isProduction: IS_PRODUCTION }))) {
    response.headers.set(name, value);
  }
  if (csp) response.headers.set("Content-Security-Policy", csp);
  if (pathname.startsWith("/api")) {
    for (const [name, value] of Object.entries(API_NO_STORE_HEADERS)) response.headers.set(name, value);
  }
  // Token CSRF (double submit) — czytelny dla skryptów tej strony, niewysyłany
  // przy żądaniach z innych stron (SameSite=Strict).
  if (!req.cookies.get(CSRF_COOKIE)?.value) {
    response.cookies.set({
      name: CSRF_COOKIE,
      value: randomToken(32),
      httpOnly: false,
      sameSite: "strict",
      secure: IS_PRODUCTION,
      path: "/",
    });
  }
  return response;
}

// Wszystkie żądania (także prefetch) przechodzą przez kontrolę sesji.
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
