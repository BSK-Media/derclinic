import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { appBaseUrl, getEmailSettings, sendTrackedEmail } from "@/lib/email-notifications";
import { newsletterEmail } from "@/lib/email-templates";
import { htmlToText, newsletterUnsubscribeToken } from "@/lib/newsletter";
import { audienceFromCampaign, newsletterRecipientsWhere } from "@/lib/newsletter-recipients";
import { mailerConfig } from "@/lib/mailer";

// Wysyłka idzie po kolei (limit żądań na sekundę u dostawcy poczty), a jedno
// wywołanie ma budżet czasu — przy dużej liście trzeba kliknąć "Dokończ
// wysyłkę" jeszcze raz. Klucz dedupeKey gwarantuje, że nikt nie dostanie tej
// samej kampanii dwa razy.
export const maxDuration = 60;
const BUDGET_MS = 45_000;
const GAP_MS = 600;

const BodySchema = z.object({ mode: z.enum(["test", "all"]) });

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN", "MANAGER"]);
  if (deny) return deny;

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("Niepoprawne dane");

  const campaign = await prisma.newsletterCampaign.findUnique({ where: { id: params.id } });
  if (!campaign) return bad("Nie znaleziono wiadomości", 404);
  if (!campaign.html.trim()) return bad("Wiadomość jest pusta — dodaj treść.");
  if (!mailerConfig().apiKeySet) return bad("Wysyłka e-mail nie jest skonfigurowana (brak RESEND_API_KEY).", 503);

  const baseUrl = appBaseUrl(req);
  const bodyText = htmlToText(campaign.html);
  const settings = await getEmailSettings();

  const contentFor = (unsubscribeToken: string, subjectPrefix = "") =>
    newsletterEmail({
      subject: `${subjectPrefix}${campaign.subject}`,
      preheader: campaign.preheader,
      bodyHtml: campaign.html,
      bodyText,
      unsubscribeUrl: `${baseUrl}/newsletter/wypisz?token=${encodeURIComponent(unsubscribeToken)}`,
      panelUrl: `${baseUrl}/panel-klienta?tab=consents`,
    });

  // Wiadomość próbna na adres zalogowanego użytkownika.
  if (parsed.data.mode === "test") {
    const me = await prisma.user.findUnique({ where: { id: user!.id }, select: { email: true } });
    if (!me?.email) return bad("Twoje konto nie ma adresu e-mail — dodaj go w profilu, żeby wysłać wiadomość próbną.");
    const result = await sendTrackedEmail({
      ...contentFor("podglad", "[TEST] "),
      type: "TEST",
      to: me.email,
      settings,
    });
    if (!result.ok) return bad(result.error || "Nie udało się wysłać wiadomości próbnej.", 502);
    return NextResponse.json({ ok: true, sentTo: me.email });
  }

  const prefix = `newsletter:${campaign.id}:`;
  const recipients = await prisma.patient.findMany({
    where: newsletterRecipientsWhere(user!.locationScopeId, audienceFromCampaign(campaign)),
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true },
  });
  const alreadySent = new Set(
    (
      await prisma.emailLog.findMany({
        where: { dedupeKey: { startsWith: prefix } },
        select: { dedupeKey: true },
      })
    ).map((row) => row.dedupeKey),
  );
  const pending = recipients.filter((patient) => !alreadySent.has(`${prefix}${patient.id}`));

  const startedAt = Date.now();
  let sentNow = 0;
  let failed = 0;
  let stoppedBy: "budget" | "not-configured" | null = null;
  for (const patient of pending) {
    if (Date.now() - startedAt > BUDGET_MS) {
      stoppedBy = "budget";
      break;
    }
    const result = await sendTrackedEmail({
      ...contentFor(newsletterUnsubscribeToken(patient.id)),
      type: "NEWSLETTER",
      to: patient.email!,
      dedupeKey: `${prefix}${patient.id}`,
      patientId: patient.id,
      settings,
    });
    if (result.ok) sentNow += 1;
    else if ("disabled" in result && result.disabled) {
      return bad("Wysyłka newslettera jest wyłączona w ustawieniach poczty e-mail.", 409);
    } else if (result.skipped) {
      stoppedBy = "not-configured";
      break;
    } else failed += 1;
    await sleep(GAP_MS);
  }

  const sentTotal = alreadySent.size + sentNow;
  await prisma.newsletterCampaign.update({
    where: { id: campaign.id },
    data: {
      status: "SENT",
      sentAt: campaign.sentAt ?? new Date(),
      recipientCount: recipients.length,
      sentCount: sentTotal,
    },
  });

  await logAudit({
    actorId: user!.id,
    action: "UPDATE",
    entity: "NewsletterCampaign",
    entityId: campaign.id,
    summary: `Wysyłka newslettera „${campaign.subject}": wysłano ${sentNow} (łącznie ${sentTotal} z ${recipients.length})${
      failed ? `, błędy: ${failed}` : ""
    }`,
    data: { sentNow, sentTotal, recipients: recipients.length, failed },
  });

  return NextResponse.json({
    ok: true,
    sentNow,
    sentTotal,
    recipientCount: recipients.length,
    failed,
    remaining: Math.max(0, recipients.length - sentTotal),
    stoppedBy,
  });
}
