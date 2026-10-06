import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { getKey } from "@/lib/auth-keys";
import { AudienceSchema } from "@/lib/newsletter-recipients";

/** Treść zapisywana z edytora (szkic kampanii). */
export const CampaignInput = z.object({
  subject: z.string().trim().min(1, "Podaj temat wiadomości").max(150, "Temat jest za długi (maks. 150 znaków)"),
  preheader: z.string().trim().max(200, "Podgląd jest za długi (maks. 200 znaków)").optional().or(z.literal("")),
  html: z.string().max(1_000_000, "Treść jest za duża"),
  // Do kogo wysłać (patrz lib/newsletter-recipients.ts). Pominięte = bez zmian.
  audience: AudienceSchema.optional(),
});

// Newsletter: oczyszczanie treści HTML pisanej w edytorze, tekstowa wersja
// wiadomości oraz podpisany link do wypisania się (bez logowania).

/**
 * Usuwa z HTML to, co w wiadomości do klientów nie ma racji bytu: skrypty,
 * ramki, formularze, obsługę zdarzeń (onclick=…) i adresy javascript:.
 * Treść pisze administrator, więc to druga linia obrony — podgląd w panelu
 * i tak działa w piaskownicy bez skryptów.
 */
export function sanitizeNewsletterHtml(input: string): string {
  let html = input;
  // Całe bloki wraz z zawartością.
  html = html.replace(/<(script|iframe|object|embed|form|noscript|template)\b[\s\S]*?<\/\1\s*>/gi, "");
  // Pojedyncze znaczniki (bez zawartości).
  html = html.replace(/<\/?(script|iframe|object|embed|form|input|button|textarea|select|link|meta|base|frame|frameset|applet)\b[^>]*>/gi, "");
  // Atrybuty zdarzeń: onclick="…", onerror='…', onload=…
  html = html.replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  // javascript: / vbscript: oraz data: (poza obrazkami) w href/src/action.
  html = html.replace(
    /\s(href|src|action|formaction|xlink:href)\s*=\s*("|')\s*(?:javascript|vbscript|data(?!:image\/(?:png|jpe?g|gif|webp);))[^"']*\2/gi,
    ' $1="#"',
  );
  // Style z wyrażeniami / importami.
  html = html.replace(/expression\s*\(|@import|behavior\s*:|-moz-binding/gi, "");
  return html.trim();
}

/** Wersja tekstowa wiadomości (dla klientów poczty bez HTML). */
export function htmlToText(html: string): string {
  return html
    .replace(/<(style|head|title)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href, text) => {
      const label = String(text).replace(/<[^>]+>/g, "").trim();
      return label && label !== href ? `${label} (${href})` : String(href);
    })
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote)>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// --- Wypisanie z newslettera ---------------------------------------------------
// Link w stopce każdej wiadomości: "<id klienta>.<podpis HMAC>". Podpis
// uniemożliwia wypisywanie cudzych kont przez zgadywanie identyfikatorów.

function unsubscribeSignature(patientId: string) {
  return createHmac("sha256", getKey("patient")).update(`newsletter-unsubscribe:${patientId}`).digest("base64url");
}

export function newsletterUnsubscribeToken(patientId: string) {
  return `${patientId}.${unsubscribeSignature(patientId)}`;
}

/** Zwraca id klienta, jeśli token jest poprawny; w przeciwnym razie null. */
export function verifyNewsletterUnsubscribeToken(token: string): string | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const patientId = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expected = unsubscribeSignature(patientId);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return patientId;
}
