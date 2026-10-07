import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { appBaseUrl, sendDueReminders } from "@/lib/email-notifications";
import { logAudit } from "@/lib/audit";
import { runConsentJobs } from "@/lib/consent-jobs";

// Wysyłka trwa (jedna wiadomość po drugiej), więc dajemy funkcji więcej czasu.
export const maxDuration = 60;

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// Przypomnienia o jutrzejszych wizytach — wołane raz dziennie przez Vercel
// Cron (harmonogram w vercel.json). Vercel sam dokleja nagłówek
// "Authorization: Bearer <CRON_SECRET>", o ile zmienna CRON_SECRET jest
// ustawiona w projekcie; bez niej endpoint odmawia pracy, żeby nikt z
// zewnątrz nie mógł go uruchamiać.
export async function GET(req: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, message: "Brak zmiennej CRON_SECRET" }, { status: 503 });
  }
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, message: "Brak autoryzacji" }, { status: 401 });
  }

  const summary = await sendDueReminders({ baseUrl: appBaseUrl(req), budgetMs: 50_000 });

  if (summary.sent > 0 || summary.failed > 0) {
    await logAudit({
      actor: { type: "SYSTEM", name: "Harmonogram" },
      action: "EMAIL_REMINDERS",
      entity: "Email",
      summary: `Przypomnienia o jutrzejszych wizytach: wysłano ${summary.sent}, błędów ${summary.failed} (wizyt z adresem e-mail: ${summary.due})`,
      data: summary,
    });
  }

  // Poranny przebieg zgód na zabieg (przypomnienia + anulowanie po terminie) —
  // jeden dzienny cron mniej do utrzymania; wieczorny to /api/cron/consent.
  const consent = await runConsentJobs({ baseUrl: appBaseUrl(req) }).catch((e) => {
    console.error("[cron] zgody na zabieg", e);
    return null;
  });

  return NextResponse.json({ ok: true, ...summary, consent });
}
