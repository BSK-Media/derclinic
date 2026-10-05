import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, requireStrictRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { mailerConfig } from "@/lib/mailer";
import { sendTrackedEmail } from "@/lib/email-notifications";
import { testEmail } from "@/lib/email-templates";
import { RATE_LIMITS, hitRateLimit, tooManyRequests } from "@/lib/rate-limit";

const BodySchema = z.object({
  to: z.string().trim().email("Podaj poprawny adres e-mail").max(200),
});

// Najczęstsze odpowiedzi Resend przetłumaczone na to, co trzeba zrobić.
function hintFor(error: string) {
  const text = error.toLowerCase();
  if (text.includes("brak resend_api_key")) {
    return "Dodaj zmienne RESEND_API_KEY i RESEND_FROM_EMAIL w Vercel (Settings → Environment Variables) i wdróż aplikację ponownie.";
  }
  if (text.includes("only send testing emails") || text.includes("verify a domain")) {
    return "Domena nadawcy nie jest zweryfikowana w Resend — do czasu weryfikacji (rekordy DNS) wiadomości dochodzą tylko na adres właściciela konta Resend.";
  }
  if (text.includes("not verified") || text.includes("domain")) {
    return "Adres nadawcy (RESEND_FROM_EMAIL) musi być w domenie zweryfikowanej w Resend.";
  }
  if (text.includes("api key") || text.includes("401")) {
    return "Klucz RESEND_API_KEY jest nieprawidłowy albo został usunięty — wygeneruj nowy w Resend i podmień go w Vercel.";
  }
  return null;
}

// Testowa wiadomość na dowolny adres — wyłącznie administrator.
export async function POST(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: parsed.error.issues[0]?.message ?? "Niepoprawne dane" },
      { status: 400 },
    );
  }

  const limit = await hitRateLimit(RATE_LIMITS.emailTest, user!.id);
  if (!limit.allowed) return tooManyRequests(limit, "Zbyt wiele wiadomości testowych. Spróbuj ponownie później.");

  const result = await sendTrackedEmail({
    ...testEmail({ sentBy: user!.name, from: mailerConfig().from }),
    type: "TEST",
    to: parsed.data.to,
  });

  await logAudit({
    actorId: user!.id,
    action: "EMAIL_TEST",
    entity: "Email",
    summary: `Testowy e-mail na adres ${parsed.data.to} — ${result.ok ? "wysłany" : "nie wysłany"}`,
    data: { to: parsed.data.to, ok: result.ok, error: result.ok ? undefined : result.error },
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, message: result.error, hint: hintFor(result.error) }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
