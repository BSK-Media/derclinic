import { createHash, hkdfSync } from "node:crypto";

// Osobne klucze dla osobnych domen zaufania (audyt bezpieczeństwa, F-08):
//  * STAFF_AUTH_SECRET    — podpis tokenów sesji personelu,
//  * PATIENT_AUTH_SECRET  — podpis tokenów sesji pacjentów,
//  * MFA_ENCRYPTION_KEY   — szyfrowanie sekretów TOTP i HMAC kodów odzyskiwania,
//  * AUDIT_SIGNING_KEY    — podpis (HMAC) wpisów dziennika zdarzeń,
//  * DATA_ENCRYPTION_KEY  — szyfrowanie zdjęć z wizyt i notatek (dane medyczne).
// Zmiana jednego klucza nie wpływa na pozostałe.
//
// Lokalnie, gdy zmienne nie są ustawione, klucze są wyprowadzane (HKDF)
// z AUTH_SECRET z różnymi etykietami. Na produkcji klucze MFA, danych i podpisu
// dziennika są obowiązkowe (build się zatrzyma bez nich — scripts/migrate-deploy.mjs);
// klucze sesji mogą tymczasowo pochodzić z AUTH_SECRET (zmiana = wylogowanie).
//
// MFA_ENCRYPTION_KEY_PREVIOUS / DATA_ENCRYPTION_KEY_PREVIOUS pozwalają obrócić
// klucz szyfrowania bez utraty danych: stare wpisy dają się odczytać, nowe są
// szyfrowane nowym kluczem.

export type KeyPurpose = "staff" | "patient" | "mfa" | "audit" | "data";

const ENV_NAMES: Record<KeyPurpose, string> = {
  staff: "STAFF_AUTH_SECRET",
  patient: "PATIENT_AUTH_SECRET",
  mfa: "MFA_ENCRYPTION_KEY",
  audit: "AUDIT_SIGNING_KEY",
  data: "DATA_ENCRYPTION_KEY",
};

const MIN_SECRET_LENGTH = 32;
const warned = new Set<string>();

function warnOnce(message: string) {
  if (warned.has(message)) return;
  warned.add(message);
  console.warn(`[security] ${message}`);
}

// Klucze, od których zależą trwałe dane (szyfrogramy, podpisy), muszą być na
// produkcji ustawione jawnie — wyprowadzenie z AUTH_SECRET oznaczałoby, że
// zmiana AUTH_SECRET bezpowrotnie niszczy zaszyfrowane zdjęcia i sekrety 2FA.
export const REQUIRED_IN_PRODUCTION: KeyPurpose[] = ["mfa", "data", "audit"];

function deriveFromLegacy(purpose: KeyPurpose): Uint8Array {
  if (process.env.NODE_ENV === "production" && REQUIRED_IN_PRODUCTION.includes(purpose)) {
    throw new Error(`Brak ${ENV_NAMES[purpose]} — na produkcji ten klucz musi być ustawiony jawnie (patrz env.example).`);
  }
  const legacy = process.env.AUTH_SECRET;
  if (!legacy) throw new Error(`Brak ${ENV_NAMES[purpose]} (ani AUTH_SECRET) — nie można podpisać/zaszyfrować danych.`);
  warnOnce(
    `${ENV_NAMES[purpose]} nie jest ustawiony — klucz wyprowadzany z AUTH_SECRET. Ustaw osobny, losowy sekret.`,
  );
  return new Uint8Array(hkdfSync("sha256", legacy, "derclinic", `derclinic/${purpose}/v1`, 32));
}

function fromEnv(name: string): Uint8Array | null {
  const value = process.env[name];
  if (!value) return null;
  if (value.length < MIN_SECRET_LENGTH) {
    throw new Error(`${name} jest za krótki (min. ${MIN_SECRET_LENGTH} znaków).`);
  }
  // Normalizujemy do 32 bajtów niezależnie od formatu (hex/base64/tekst).
  return new Uint8Array(hkdfSync("sha256", value, "derclinic", `derclinic/env/${name}`, 32));
}

export function getKey(purpose: KeyPurpose): Uint8Array {
  return fromEnv(ENV_NAMES[purpose]) ?? deriveFromLegacy(purpose);
}

/** Klucze szyfrowania: [bieżący, poprzedni?] — do odszyfrowania próbujemy po kolei. */
export function getEncryptionKeys(purpose: "mfa" | "data"): Uint8Array[] {
  const keys = [getKey(purpose)];
  const previous = fromEnv(`${ENV_NAMES[purpose]}_PREVIOUS`);
  if (previous) keys.push(previous);
  return keys;
}

export function getMfaKeys(): Uint8Array[] {
  return getEncryptionKeys("mfa");
}

/** Krótki, jawny identyfikator klucza (do oznaczania szyfrogramów, bez ujawniania klucza). */
export function keyId(key: Uint8Array) {
  return createHash("sha256").update(key).digest("hex").slice(0, 8);
}
