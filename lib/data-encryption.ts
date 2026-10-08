import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { getEncryptionKeys, keyId } from "@/lib/auth-keys";

const GCM_TAG_LENGTH = 16;

// Szyfrowanie aplikacyjne danych medycznych w bazie (audyt F-09/F-10):
// zdjęcia przed/po oraz notatki do wizyt i pacjentów. Zrzut bazy (backup,
// wyciek) nie zawiera ich w postaci jawnej — klucz (DATA_ENCRYPTION_KEY) jest
// poza bazą. Format: "enc:v1.<keyId>.<iv>.<szyfrogram>.<tag>" (base64url).
// Wartości bez prefiksu to dane sprzed wdrożenia — odczytujemy je bez zmian,
// a skrypt/endpoint backfill szyfruje je stopniowo.

export const ENCRYPTED_PREFIX = "enc:v1.";

export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(ENCRYPTED_PREFIX);
}

export function encryptField(value: string | null | undefined): string | null | undefined {
  if (value === null || value === undefined || value === "" || isEncrypted(value)) return value;
  const [key] = getEncryptionKeys("data");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${ENCRYPTED_PREFIX}${keyId(key)}.${iv.toString("base64url")}.${ciphertext.toString("base64url")}.${cipher
    .getAuthTag()
    .toString("base64url")}`;
}

export function decryptField(value: string | null | undefined): string | null | undefined {
  if (!isEncrypted(value)) return value;
  const [id, iv, ciphertext, tag] = value!.slice(ENCRYPTED_PREFIX.length).split(".");
  const key = getEncryptionKeys("data").find((candidate) => keyId(candidate) === id);
  if (!key || !iv || !ciphertext || !tag) {
    console.error("[data-encryption] Brak klucza do odszyfrowania pola (sprawdź DATA_ENCRYPTION_KEY / _PREVIOUS)");
    return null;
  }
  try {
    const authTag = Buffer.from(tag, "base64url");
    // Pełny 16-bajtowy znacznik — skrócony pozwalałby podrabiać szyfrogramy.
    if (authTag.length !== GCM_TAG_LENGTH) throw new Error("Nieprawidłowy znacznik uwierzytelniający");
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"), { authTagLength: GCM_TAG_LENGTH });
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    console.error("[data-encryption] Nie udało się odszyfrować pola (uszkodzone dane lub zły klucz)");
    return null;
  }
}

// Pola szyfrowane per model (nazwy modeli jak w Prisma, z małej litery).
export const ENCRYPTED_FIELDS = {
  appointment: ["photoBefore", "photoAfter", "note"],
  patient: ["note"],
  consumption: ["note"],
} as const;

type EncryptedModel = keyof typeof ENCRYPTED_FIELDS;

function encryptRecord(model: EncryptedModel, data: unknown): unknown {
  if (!data || typeof data !== "object") return data;
  if (Array.isArray(data)) return data.map((item): unknown => encryptRecord(model, item));
  const record = { ...(data as Record<string, unknown>) };
  for (const field of ENCRYPTED_FIELDS[model]) {
    const value = record[field];
    if (typeof value === "string") record[field] = encryptField(value);
    // Operacja typu { set: "..." }
    else if (value && typeof value === "object" && typeof (value as { set?: unknown }).set === "string") {
      record[field] = { set: encryptField((value as { set: string }).set) };
    }
  }
  return record;
}

/** Szyfruje pola w argumentach operacji zapisu (create/update/upsert/createMany/updateMany). */
export function encryptWriteArgs(model: EncryptedModel, operation: string, args: any) {
  if (!args || typeof args !== "object") return args;
  const next = { ...args };
  if (["create", "update", "createMany", "updateMany", "createManyAndReturn", "updateManyAndReturn"].includes(operation)) {
    next.data = encryptRecord(model, next.data);
  }
  if (operation === "upsert") {
    next.create = encryptRecord(model, next.create);
    next.update = encryptRecord(model, next.update);
  }
  return next;
}

/**
 * Odszyfrowuje wszystkie zaszyfrowane wartości w wyniku zapytania — także
 * w relacjach dołączonych przez include/select (np. wizyta → pacjent → notatka).
 */
export function decryptDeep<T>(value: T): T {
  if (typeof value === "string") return (isEncrypted(value) ? decryptField(value) : value) as T;
  if (!value || typeof value !== "object") return value;
  if (value instanceof Date || Buffer.isBuffer(value) || value instanceof Uint8Array) return value;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) value[i] = decryptDeep(value[i]);
    return value;
  }
  // Tylko zwykłe obiekty z wyników Prisma (nie Decimal itp.).
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return value;
  for (const key of Object.keys(value as Record<string, unknown>)) {
    (value as Record<string, unknown>)[key] = decryptDeep((value as Record<string, unknown>)[key]);
  }
  return value;
}

export function isEncryptedModel(model: string): model is EncryptedModel {
  return model in ENCRYPTED_FIELDS;
}
