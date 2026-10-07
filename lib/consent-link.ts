import { createHmac, timingSafeEqual } from "node:crypto";
import { getKey } from "@/lib/auth-keys";

// Link do zgody na zabieg (bez logowania) — lekki moduł bez bibliotek PDF i
// podpisów, żeby importowały go także maile, rezerwacja i harmonogram.

function tokenSignature(appointmentId: string) {
  return createHmac("sha256", getKey("patient")).update(`procedure-consent:${appointmentId}`).digest("base64url");
}

/** Token "<id wizyty>.<podpis HMAC>" — pozwala pobrać dokument i wgrać plik także gościowi bez konta. */
export function consentToken(appointmentId: string) {
  return `${appointmentId}.${tokenSignature(appointmentId)}`;
}

export function appointmentIdFromConsentToken(token: string): string | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const id = token.slice(0, dot);
  const a = Buffer.from(token.slice(dot + 1));
  const b = Buffer.from(tokenSignature(id));
  return a.length === b.length && timingSafeEqual(a, b) ? id : null;
}

/** Adres strony zgody; z pustym baseUrl zwraca ścieżkę względną (np. do powiadomień push). */
export function consentPageUrl(baseUrl: string, appointmentId: string) {
  return `${baseUrl.replace(/\/+$/, "")}/zgoda/${encodeURIComponent(consentToken(appointmentId))}`;
}
