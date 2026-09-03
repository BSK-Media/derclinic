import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

// Sesja pacjenta jest całkowicie osobna od sesji personelu (lib/auth-cookie.ts):
// inne ciasteczko, inny kształt tokenu, brak ról ADMIN/RECEPTION/SPECIALIST.
// Dzięki temu panel klienta nie koliduje z logowaniem do DerClinic OS —
// można być jednocześnie zalogowanym jako pracownik i jako pacjent.

export type PatientAuthUser = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
};

const COOKIE_NAME = "derclinic_patient";

function secretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export async function signPatientToken(patient: PatientAuthUser) {
  const now = Math.floor(Date.now() / 1000);
  return await new SignJWT({ ...patient, kind: "patient" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(now + 60 * 60 * 24 * 30)
    .sign(secretKey());
}

export async function verifyPatientToken(token: string): Promise<PatientAuthUser | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    const p = payload as any;
    if (p?.kind !== "patient" || !p?.id) return null;
    return {
      id: String(p.id),
      name: String(p.name ?? ""),
      phone: p.phone ? String(p.phone) : null,
      email: p.email ? String(p.email) : null,
    };
  } catch {
    return null;
  }
}

export async function getPatientAuth(): Promise<PatientAuthUser | null> {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;
  return await verifyPatientToken(token);
}

export function setPatientAuthCookie(token: string) {
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

export function clearPatientAuthCookie() {
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

export const PATIENT_AUTH_COOKIE_NAME = COOKIE_NAME;
