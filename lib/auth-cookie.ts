import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

export type Role = "ADMIN" | "RECEPTION" | "SPECIALIST";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
};

const COOKIE_NAME = "bsk_auth";

function secretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export async function signAuthToken(user: AuthUser) {
  const now = Math.floor(Date.now() / 1000);
  return await new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(now + 60 * 60 * 24 * 30)
    .sign(secretKey());
}

export async function verifyAuthToken(token: string): Promise<AuthUser | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    const u = payload as any;
    if (!u?.id || !u?.email || !u?.role) return null;
    return {
      id: String(u.id),
      email: String(u.email),
      name: String(u.name ?? ""),
      role: u.role as Role,
    };
  } catch {
    return null;
  }
}

export async function getAuthUser(): Promise<AuthUser | null> {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;
  return await verifyAuthToken(token);
}

export function setAuthCookie(token: string) {
  cookies().set({
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export function clearAuthCookie() {
  cookies().set({
    name: COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}
export const AUTH_COOKIE_NAME = COOKIE_NAME;
