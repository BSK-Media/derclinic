import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { mailerConfig } from "@/lib/mailer";
import { CampaignInput, sanitizeNewsletterHtml } from "@/lib/newsletter";
import { newsletterRecipientsWhere } from "@/lib/newsletter-recipients";

// Lista kampanii newslettera + liczba klientów, do których trafi wysyłka
// (zgoda marketingowa, adres e-mail, bez usuniętych kont).
export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN", "MANAGER"]);
  if (deny) return deny;

  const [campaigns, recipients] = await Promise.all([
    prisma.newsletterCampaign.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        subject: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        sentAt: true,
        recipientCount: true,
        sentCount: true,
      },
    }),
    prisma.patient.count({ where: newsletterRecipientsWhere(user!.locationScopeId) }),
  ]);

  return NextResponse.json({ ok: true, campaigns, recipients, mailConfigured: mailerConfig().apiKeySet });
}

export async function POST(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN", "MANAGER"]);
  if (deny) return deny;

  const parsed = CampaignInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: parsed.error.issues[0]?.message ?? "Niepoprawne dane" }, { status: 400 });
  }

  const campaign = await prisma.newsletterCampaign.create({
    data: {
      subject: parsed.data.subject,
      preheader: parsed.data.preheader || null,
      html: sanitizeNewsletterHtml(parsed.data.html),
      ...(parsed.data.audience
        ? {
            audienceType: parsed.data.audience.type,
            audienceListIds: parsed.data.audience.listIds,
            audiencePatientIds: parsed.data.audience.patientIds,
          }
        : {}),
      createdById: user!.id,
    },
    select: { id: true },
  });

  await logAudit({
    actorId: user!.id,
    action: "CREATE",
    entity: "NewsletterCampaign",
    entityId: campaign.id,
    summary: `Utworzono szkic newslettera „${parsed.data.subject}"`,
  });

  return NextResponse.json({ ok: true, id: campaign.id });
}
