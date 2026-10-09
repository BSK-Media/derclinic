// Prosta ochrona formularzy publicznych przed botami (rejestr luk L-17), uzupełnienie limitów
// z lib/rate-limit.ts. To NIE zastępuje CAPTCHA ani zapory WAF — odsiewa tylko proste skrypty:
//  * pole-pułapka "website" (ukryte dla ludzi) musi być puste,
//  * formularz nie może zostać wysłany szybciej niż MIN_FILL_MS od otwarcia strony.
import { NextResponse } from "next/server";

const MIN_FILL_MS = 3000;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function botGuardRejects(json: unknown): boolean {
  if (!json || typeof json !== "object") return false; // walidację schematu zrobi właściwy handler
  const body = json as Record<string, unknown>;
  if (typeof body.website === "string" && body.website.trim() !== "") return true;
  const opened = Number(body.formOpenedAt);
  if (!Number.isFinite(opened)) return true;
  const age = Date.now() - opened;
  return age < MIN_FILL_MS || age > MAX_AGE_MS;
}

export function botRejectedResponse() {
  // Ogólny komunikat — nie podpowiadamy botom, który mechanizm zadziałał.
  return NextResponse.json(
    { ok: false, message: "Nie udało się wysłać formularza. Odśwież stronę i spróbuj ponownie." },
    { status: 400 },
  );
}
