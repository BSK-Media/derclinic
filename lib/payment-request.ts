import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { getKey } from "@/lib/auth-keys";

// Płatności ręczne przy rezerwacji online (BLIK na telefon, przelew
// tradycyjny; w przyszłości Przelewy24): wspólne, czyste funkcje — tytuł
// płatności, link bez logowania i dane konta.

export type ManualPaymentMethod = "BLIK" | "TRANSFER";
export type PaymentMethodKey = ManualPaymentMethod | "P24";

export const PAYMENT_METHOD_LABELS: Record<PaymentMethodKey, string> = {
  P24: "Przelewy24",
  BLIK: "BLIK na telefon",
  TRANSFER: "Przelew tradycyjny",
};

export const PAYMENT_REQUEST_STATUS_LABELS: Record<string, string> = {
  AWAITING: "Czeka na płatność",
  CLAIMED: "Czeka na potwierdzenie",
  CONFIRMED: "Opłacone",
  REJECTED: "Odrzucona",
};

// --- Tytuł płatności -----------------------------------------------------------
// Krótki kod bez znaków łatwych do pomylenia (0/O, 1/I). Ten sam kod klient
// wpisuje w tytule przelewu / BLIK-a i widzi administrator przy płatności —
// po nim paruje się wpłatę z wyciągiem z konta.

const REFERENCE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generatePaymentReference() {
  let code = "";
  for (let i = 0; i < 6; i++) code += REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)];
  return `DC-${code}`;
}

// --- Link do płatności (bez logowania) -------------------------------------------

function tokenSignature(appointmentId: string) {
  return createHmac("sha256", getKey("patient")).update(`payment-request:${appointmentId}`).digest("base64url");
}

export function paymentToken(appointmentId: string) {
  return `${appointmentId}.${tokenSignature(appointmentId)}`;
}

export function appointmentIdFromPaymentToken(token: string): string | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const id = token.slice(0, dot);
  const a = Buffer.from(token.slice(dot + 1));
  const b = Buffer.from(tokenSignature(id));
  return a.length === b.length && timingSafeEqual(a, b) ? id : null;
}

export function paymentPageUrl(baseUrl: string, appointmentId: string) {
  return `${baseUrl.replace(/\/+$/, "")}/platnosc/${encodeURIComponent(paymentToken(appointmentId))}`;
}

// --- Numer konta -----------------------------------------------------------------

export function normalizeAccount(value: string) {
  return value.replace(/[\s-]/g, "").replace(/^PL/i, "");
}

/** Polski numer konta (NRB, 26 cyfr) z poprawną sumą kontrolną IBAN (mod 97). */
export function isValidPolishAccount(value: string) {
  const account = normalizeAccount(value);
  if (!/^\d{26}$/.test(account)) return false;
  const check = account.slice(0, 2);
  const bban = account.slice(2);
  return BigInt(`${bban}2521${check}`) % 97n === 1n;
}

/** "12 3456 7890 …" — czytelniejszy zapis numeru konta. */
export function formatAccount(value: string) {
  const account = normalizeAccount(value);
  if (account.length !== 26) return value;
  return `${account.slice(0, 2)} ${account.slice(2).replace(/(\d{4})(?=\d)/g, "$1 ")}`;
}

/** Numer telefonu BLIK w formacie "+48 123 456 789" (jeśli to 9 cyfr). */
export function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "").replace(/^48(?=\d{9}$)/, "");
  return digits.length === 9 ? `+48 ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}` : value;
}
