import { createHmac, timingSafeEqual } from "node:crypto";
import { getKey } from "@/lib/auth-keys";

// Zatrzymanie terminu na czas płatności przy rezerwacji online (BookingHold):
// stałe i link z tokenem. Wizyta powstaje dopiero po „Dokonałem płatności".

/** Na ile minut termin jest zatrzymany dla klienta, który płaci. */
export const BOOKING_HOLD_MINUTES = 30;

function tokenSignature(holdId: string) {
  return createHmac("sha256", getKey("patient")).update(`booking-hold:${holdId}`).digest("base64url");
}

export function holdToken(holdId: string) {
  return `${holdId}.${tokenSignature(holdId)}`;
}

export function holdIdFromToken(token: string): string | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const id = token.slice(0, dot);
  const a = Buffer.from(token.slice(dot + 1));
  const b = Buffer.from(tokenSignature(id));
  return a.length === b.length && timingSafeEqual(a, b) ? id : null;
}
