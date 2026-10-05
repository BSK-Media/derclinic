// Prosty wysyłacz e-maili transakcyjnych przez Resend (https://resend.com) —
// używamy gołego fetch do ich REST API zamiast SDK, żeby nie dodawać nowej
// zależności npm. Wymaga zmiennych środowiskowych RESEND_API_KEY i
// RESEND_FROM_EMAIL (patrz env.example). Jeśli nie są ustawione, e-mail nie
// zostanie wysłany — funkcja i tak "cicho" się nie wywala (endpointy, które
// z niej korzystają, zawsze zwracają klientowi ten sam ogólny komunikat, żeby
// nie zdradzać czy dany adres ma konto), ale logujemy ostrzeżenie na serwerze,
// żeby było widać w logach Vercela, że trzeba dodać klucz.
//
// Reszta aplikacji nie woła tej funkcji wprost, tylko sendTrackedEmail z
// lib/email-notifications.ts — tam są ustawienia admina i dziennik wysyłek.

import { maskPii } from "@/lib/audit-format";

export type SendEmailResult =
  | { ok: true; skipped: false; id: string | null }
  | { ok: false; skipped: boolean; error: string };

/** Stan konfiguracji wysyłki — bez ujawniania samego klucza. */
export function mailerConfig() {
  return {
    apiKeySet: Boolean(process.env.RESEND_API_KEY),
    from: process.env.RESEND_FROM_EMAIL || null,
  };
}

async function postToResend(apiKey: string, payload: Record<string, unknown>) {
  return fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string | null;
}): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !from) {
    console.warn(
      "[mailer] RESEND_API_KEY / RESEND_FROM_EMAIL nie są ustawione — e-mail NIE został wysłany. " +
        `(miał pójść do: ${maskPii(input.to)}, temat: "${input.subject}")`,
    );
    return {
      ok: false,
      skipped: true,
      error: "Wysyłka nie jest skonfigurowana (brak RESEND_API_KEY lub RESEND_FROM_EMAIL).",
    };
  }

  const payload = {
    from,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
    ...(input.replyTo ? { reply_to: input.replyTo } : {}),
  };

  try {
    let response = await postToResend(apiKey, payload);
    // Resend ogranicza liczbę żądań na sekundę — jedna ponowna próba po chwili.
    if (response.status === 429) {
      await new Promise((resolve) => setTimeout(resolve, 1100));
      response = await postToResend(apiKey, payload);
    }
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error("[mailer] Resend API error", response.status, body);
      let message = body;
      try {
        message = JSON.parse(body)?.message ?? body;
      } catch {
        /* odpowiedź nie była JSON-em */
      }
      return {
        ok: false,
        skipped: false,
        error: `Resend ${response.status}: ${String(message).slice(0, 400) || "brak szczegółów"}`,
      };
    }
    const data = (await response.json().catch(() => null)) as { id?: string } | null;
    return { ok: true, skipped: false, id: data?.id ?? null };
  } catch (e) {
    console.error("[mailer] Failed to send email", e);
    return { ok: false, skipped: false, error: "Nie udało się połączyć z Resend." };
  }
}
