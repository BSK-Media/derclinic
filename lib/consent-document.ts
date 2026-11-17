// Skan podpisanej zgody wgrywany przez recepcję: dozwolone typy i sprawdzanie zawartości pliku (nie ufamy nazwie ani nagłówkowi).
import { detectImageMime } from "@/lib/newsletter-images";

export const CONSENT_DOCUMENT_MAX_BYTES = 6 * 1024 * 1024;

export type ConsentDocumentMime = "image/jpeg" | "image/png" | "image/gif" | "image/webp" | "application/pdf";

export function detectConsentDocumentMime(bytes: Uint8Array): ConsentDocumentMime | null {
  // %PDF-
  if (bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d) {
    return "application/pdf";
  }
  return detectImageMime(bytes);
}

/** Bezpieczna nazwa pliku do zapisu i nagłówka pobierania. */
export function safeDocumentName(name: string, mime: ConsentDocumentMime): string {
  const extension = mime === "application/pdf" ? "pdf" : mime.split("/")[1].replace("jpeg", "jpg");
  const base = name
    .replace(/\.[^.]*$/, "")
    .replace(/[^\p{L}\p{N}_-]+/gu, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
  return `${base || "zgoda"}.${extension}`;
}
