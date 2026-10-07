import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { appBaseUrl } from "@/lib/email-notifications";
import { runConsentJobs } from "@/lib/consent-jobs";
import { logAudit } from "@/lib/audit";

export const maxDuration = 60;

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// Zgody na zabieg: anulowanie rezerwacji po terminie bez podpisanej zgody oraz
// przypomnienia (push rano i wieczorem, e-mail rano). Wołane przez harmonogram
// (Vercel Cron i/lub GitHub Actions — patrz .github/workflows/consent-cron.yml)
// z nagłówkiem "Authorization: Bearer <CRON_SECRET>". Można wołać często:
// każde zadanie jest idempotentne.
export async function GET(req: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, message: "Brak zmiennej CRON_SECRET" }, { status: 503 });
  }
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, message: "Brak autoryzacji" }, { status: 401 });
  }

  const summary = await runConsentJobs({ baseUrl: appBaseUrl(req) });

  if (summary.canceled > 0) {
    await logAudit({
      actor: { type: "SYSTEM", name: "Harmonogram" },
      action: "UPDATE",
      entity: "ProcedureConsent",
      summary: `Automatyczne anulowanie rezerwacji bez podpisanej zgody: ${summary.canceled}`,
      data: summary,
    });
  }

  return NextResponse.json({ ok: true, ...summary });
}
