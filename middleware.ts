import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

function secretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(secret);
}

async function getUserFromRequest(req: NextRequest): Promise<{ role?: string; login?: string } | null> {
  const token = req.cookies.get("bsk_auth")?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return { role: payload.role as string | undefined, login: payload.email as string | undefined };
  } catch {
    return null;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const needsAuth =
    pathname.startsWith("/admin") ||
    pathname.startsWith("/specialist") ||
    pathname.startsWith("/api");

  if (!needsAuth) return NextResponse.next();

  // allow auth endpoints without session
  if (pathname.startsWith("/api/auth/login") || pathname.startsWith("/api/auth/logout")) return NextResponse.next();

  const user = await getUserFromRequest(req);
  if (!user?.role) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  const role = user.role;

  if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
    if (role !== "ADMIN" && role !== "RECEPTION") return NextResponse.redirect(new URL("/specialist", req.url));
  }

  if (pathname.startsWith("/specialist") || pathname.startsWith("/api/specialist")) {
    if (role !== "SPECIALIST" && role !== "ADMIN") return NextResponse.redirect(new URL("/admin", req.url));
  }

  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
