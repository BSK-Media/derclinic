// Prosty wysyłacz e-maili transakcyjnych przez Resend (https://resend.com) —
// używamy gołego fetch do ich REST API zamiast SDK, żeby nie dodawać nowej
// zależności npm. Wymaga zmiennych środowiskowych RESEND_API_KEY i
// RESEND_FROM_EMAIL (patrz env.example). Jeśli nie są ustawione, e-mail nie
// zostanie wysłany — funkcja i tak "cicho" się nie wywala (endpointy, które
// z niej korzystają, zawsze zwracają klientowi ten sam ogólny komunikat, żeby
// nie zdradzać czy dany adres ma konto), ale logujemy ostrzeżenie na serwerze,
// żeby było widać w logach Vercela, że trzeba dodać klucz.

export async function sendEmail(input: { to: string; subject: string; html: string; text?: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !from) {
    console.warn(
      "[mailer] RESEND_API_KEY / RESEND_FROM_EMAIL nie są ustawione — e-mail NIE został wysłany. " +
        `(miał pójść do: ${input.to}, temat: "${input.subject}")`,
    );
    return { ok: false as const, skipped: true as const };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error("[mailer] Resend API error", response.status, body);
      return { ok: false as const, skipped: false as const };
    }
    return { ok: true as const, skipped: false as const };
  } catch (e) {
    console.error("[mailer] Failed to send email", e);
    return { ok: false as const, skipped: false as const };
  }
}
