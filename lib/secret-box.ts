import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import { getMfaKeys, keyId } from "@/lib/auth-keys";

const GCM_TAG_LENGTH = 16;

// Szyfrowanie aplikacyjne małych sekretów (np. sekretu TOTP) AES-256-GCM.
// Format: "v1.<keyId>.<iv>.<szyfrogram>.<tag>" (base64url) — keyId pozwala
// odszyfrować wpisy zaszyfrowane poprzednim kluczem po jego rotacji.

export function sealSecret(plaintext: string): string {
  const [key] = getMfaKeys();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", keyId(key), iv.toString("base64url"), ciphertext.toString("base64url"), tag.toString("base64url")].join(
    ".",
  );
}

export function openSecret(sealed: string): string {
  const [version, id, iv, ciphertext, tag] = sealed.split(".");
  if (version !== "v1" || !id || !iv || !ciphertext || !tag) throw new Error("Nieprawidłowy format zaszyfrowanego sekretu");
  const key = getMfaKeys().find((candidate) => keyId(candidate) === id);
  if (!key) throw new Error("Brak klucza, którym zaszyfrowano sekret (sprawdź MFA_ENCRYPTION_KEY / _PREVIOUS)");
  const authTag = Buffer.from(tag, "base64url");
  // Pełny 16-bajtowy znacznik — skrócony pozwalałby podrabiać szyfrogramy.
  if (authTag.length !== GCM_TAG_LENGTH) throw new Error("Nieprawidłowy znacznik uwierzytelniający");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"), { authTagLength: GCM_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}

/** Deterministyczny, kluczowany hash (np. kodów odzyskiwania) — HMAC-SHA256 bieżącym kluczem MFA. */
export function keyedHash(value: string, key = getMfaKeys()[0]): string {
  return createHmac("sha256", key).update(value).digest("hex");
}

/** Hashe tej samej wartości wszystkimi kluczami (bieżącym i poprzednim) — do wyszukiwania po rotacji. */
export function keyedHashCandidates(value: string): string[] {
  return getMfaKeys().map((key) => keyedHash(value, key));
}
