import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import {
  firstAllowedSidebarHref,
  hasSidebarPermission,
  normalizeSidebarPermissions,
  sidebarPermissionForPath,
  type SidebarPermission,
} from "./lib/sidebar-permissions";

function secretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(secret);
}

type MiddlewareUser = {
  role: string;
  login?: string;
  sidebarPermissions: SidebarPermission[];
};

async function getUserFromRequest(req: NextRequest): Promise<MiddlewareUser | null> {
  const token = req.cookies.get("bsk_auth")?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    const role = String(payload.role ?? "");
    if (!role) return null;
    return {
      role,
      login: payload.email as string | undefined,
      sidebarPermissions: normalizeSidebarPermissions(role, payload.sidebarPermissions),
    };
  } catch {
    return null;
  }
}

function rejectAccess(req: NextRequest, user: MiddlewareUser) {
  if (req.nextUrl.pathname.startsWith("/api")) {
    return NextResponse.json({ ok: false, message: "Brak uprawnień" }, { status: 403 });
  }

  const url = req.nextUrl.clone();
  url.pathname = firstAllowedSidebarHref(user.role, user.sidebarPermissions);
  url.search = "";
  return NextResponse.redirect(url);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const needsAuth =
    pathname.startsWith("/admin") ||
    pathname.startsWith("/specialist") ||
    pathname.startsWith("/access-denied") ||
    pathname.startsWith("/api");

  if (!needsAuth) return NextResponse.next();

  // allow auth endpoints without session
  if (pathname.startsWith("/api/auth/login") || pathname.startsWith("/api/auth/logout"))
    return NextResponse.next();

  const user = await getUserFromRequest(req);
  if (!user) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ ok: false, message: "Brak autoryzacji" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  const role = user.role;
  if (pathname.startsWith("/access-denied")) return NextResponse.next();

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
      pathname.startsWith("/api/admin/appointments") ||
      pathname.startsWith("/api/admin/specialists") ||
      pathname.startsWith("/api/admin/consumption-adjustments"));
  if (specialistAdminAppointments) return rejectAccess(req, user);

  if (permission && !hasSidebarPermission(role, user.sidebarPermissions, permission)) {
    return rejectAccess(req, user);
  }

  // Nieznane podstrony administracyjne (np. zarządzanie kontami użytkowników)
  // pozostają zastrzeżone wyłącznie dla administratora.
  if (
    (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) &&
    !permission &&
    role !== "ADMIN"
  ) {
    return rejectAccess(req, user);
  }

  if (pathname.startsWith("/specialist") || pathname.startsWith("/api/specialist")) {
    const receptionAppointments =
      role === "RECEPTION" &&
      (pathname.startsWith("/specialist/appointments") ||
        pathname.startsWith("/api/specialist/appointments"));
    if (role !== "SPECIALIST" && role !== "ADMIN" && !receptionAppointments) {
      return rejectAccess(req, user);
    }
  }

  const requestHeaders = new Headers(req.headers);
  requestHeaders.delete("x-bsk-sidebar-permission");

  // Istniejące endpointy nadal kontrolują role. Ten nagłówek informuje je,
  // że podpisany token przyznał użytkownikowi dostęp do konkretnej sekcji.
  if (permission && pathname.startsWith("/api/admin") && role !== "ADMIN") {
    requestHeaders.set("x-bsk-sidebar-permission", permission);
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
