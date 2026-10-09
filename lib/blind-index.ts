import { createHmac, hkdfSync } from "node:crypto";
import { getKey } from "@/lib/auth-keys";

// Indeksy ślepe (blind index) dla zaszyfrowanych danych identyfikacyjnych pacjenta
// (imię i nazwisko, telefon, e-mail). Zaszyfrowanego pola (AES-GCM z losowym IV) nie da się
// porównać w zapytaniu SQL, więc obok niego trzymamy skrót HMAC-SHA256 znormalizowanej wartości.
// Pozwala to znaleźć pacjenta po DOKŁADNEJ wartości (logowanie, rezerwacja, wykrywanie
// duplikatów), bez odszyfrowywania całej tabeli. Wyszukiwanie częściowe ("zawiera") robi aplikacja
// w pamięci na odszyfrowanych danych.
//
// Klucz: BLIND_INDEX_KEY, a gdy go nie ma — wyprowadzony z DATA_ENCRYPTION_KEY (wymaganego na
// produkcji). Zmiana klucza wymaga przeliczenia skrótów (narzędzie w "Bezpieczeństwo konta").

export type BlindField = "name" | "email" | "phone";

export const BLIND_COLUMNS: Record<BlindField, string> = {
  name: "nameHash",
  email: "emailHash",
  phone: "phoneHash",
};

let cachedKey: Uint8Array | null = null;
let cachedFor = "";

function indexKey(): Uint8Array {
  const explicit = process.env.BLIND_INDEX_KEY;
  const marker = explicit ?? `data:${process.env.DATA_ENCRYPTION_KEY ?? process.env.AUTH_SECRET ?? ""}`;
  if (cachedKey && cachedFor === marker) return cachedKey;
  const source = explicit && explicit.length >= 32 ? explicit : Buffer.from(getKey("data"));
  cachedKey = new Uint8Array(hkdfSync("sha256", source, "derclinic", "derclinic/blind-index/v1", 32));
  cachedFor = marker;
  return cachedKey;
}

export function normalizeBlind(field: BlindField, value: string): string {
  const trimmed = value.trim();
  if (field === "email") return trimmed.toLowerCase();
  if (field === "phone") return trimmed.replace(/[\s()-]/g, "");
  return trimmed;
}

/** Skrót do porównań równościowych; puste wartości → null (tak samo jak brak wartości). */
export function blindIndex(field: BlindField, value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const normalized = normalizeBlind(field, value);
  if (!normalized) return null;
  return createHmac("sha256", indexKey()).update(`${field}:${normalized}`).digest("hex");
}

const FIELDS = Object.keys(BLIND_COLUMNS) as BlindField[];

/** Dokłada skróty do danych zapisu (create/update) rekordu Patient — musi być wywołane PRZED szyfrowaniem pól. */
export function addBlindIndexes(data: unknown): unknown {
  if (!data || typeof data !== "object") return data;
  if (Array.isArray(data)) return data.map(addBlindIndexes);
  const record = { ...(data as Record<string, unknown>) };
  for (const field of FIELDS) {
    if (!(field in record)) continue;
    const raw = record[field];
    const value =
      raw && typeof raw === "object" && "set" in (raw as object) ? (raw as { set: unknown }).set : raw;
    if (typeof value === "string" || value === null) record[BLIND_COLUMNS[field]] = blindIndex(field, value as string | null);
  }
  return record;
}

const OPERATORS_EQUALITY = new Set(["equals", "not", "in", "notIn", "mode"]);

function clauseFor(field: BlindField, condition: unknown): Record<string, unknown> {
  const column = BLIND_COLUMNS[field];
  if (condition === null) return { [column]: null };
  if (typeof condition === "string") return { [column]: blindIndex(field, condition) };
  if (!condition || typeof condition !== "object") return {};
  const ops = condition as Record<string, unknown>;
  const parts: Record<string, unknown>[] = [];
  for (const [op, value] of Object.entries(ops)) {
    if (!OPERATORS_EQUALITY.has(op)) {
      throw new Error(
        `Zapytanie ${op} po zaszyfrowanym polu pacjenta „${field}” nie jest obsługiwane w bazie — filtruj w pamięci (lib/patient-search.ts).`,
      );
    }
    if (op === "mode") continue;
    if (op === "equals") parts.push({ [column]: value === null ? null : blindIndex(field, value as string) });
    else if (op === "in") parts.push({ [column]: { in: (value as string[]).map((v) => blindIndex(field, v)).filter((h): h is string => !!h) } });
    else if (op === "notIn") parts.push({ OR: [{ [column]: null }, { [column]: { notIn: (value as string[]).map((v) => blindIndex(field, v)).filter((h): h is string => !!h) } }] });
    else if (op === "not") {
      if (value === null) parts.push({ [column]: { not: null } });
      else if (typeof value === "string") parts.push({ OR: [{ [column]: null }, { [column]: { not: blindIndex(field, value) } }] });
      else throw new Error(`Zagnieżdżony warunek „not” po zaszyfrowanym polu pacjenta „${field}” nie jest obsługiwany.`);
    }
  }
  return parts.length === 1 ? parts[0] : { AND: parts };
}

const LOGICAL = new Set(["AND", "OR", "NOT"]);

/**
 * Przepisuje warunki `where` tak, by pola name/email/phone pacjenta porównywały skróty zamiast
 * zaszyfrowanych wartości. Obsługuje zapytania o Patient oraz filtry relacji `patient: {...}`
 * w innych modelach. Nieobsługiwane operatory (contains/startsWith…) zgłaszają błąd zamiast
 * po cichu zwracać pusty wynik.
 */
export function rewritePatientWhere(where: unknown, isPatient: boolean): unknown {
  if (!where || typeof where !== "object") return where;
  if (Array.isArray(where)) return where.map((item) => rewritePatientWhere(item, isPatient));
  const input = where as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  const extra: unknown[] = [];

  for (const [key, value] of Object.entries(input)) {
    if (LOGICAL.has(key)) {
      output[key] = rewritePatientWhere(value, isPatient);
    } else if (isPatient && (FIELDS as string[]).includes(key)) {
      extra.push(clauseFor(key as BlindField, value));
    } else if (key === "patient" && value && typeof value === "object") {
      // filtr relacji to-one: bezpośredni warunek albo { is } / { isNot }
      const rel = value as Record<string, unknown>;
      output[key] = "is" in rel || "isNot" in rel
        ? Object.fromEntries(Object.entries(rel).map(([k, v]) => [k, rewritePatientWhere(v, true)]))
        : rewritePatientWhere(rel, true);
    } else if (value && typeof value === "object" && !(value instanceof Date)) {
      output[key] = rewritePatientWhere(value, false);
    } else {
      output[key] = value;
    }
  }

  if (extra.length) {
    const existing = output.AND === undefined ? [] : Array.isArray(output.AND) ? output.AND : [output.AND];
    output.AND = [...existing, ...extra];
  }
  return output;
}
