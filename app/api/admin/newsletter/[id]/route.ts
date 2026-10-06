import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { CampaignInput, sanitizeNewsletterHtml } from "@/lib/newsletter";

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN", "MANAGER"]);
  if (deny) return deny;

  const campaign = await prisma.newsletterCampaign.findUnique({ where: { id: params.id } });
  if (!campaign) return bad("Nie znaleziono wiadomości", 404);
  return NextResponse.json({ ok: true, campaign });
}

// Zapis szkicu. Wysłanej kampanii nie edytujemy — jej treść zostaje taka, jaką
// dostali klienci; nową wersję zapisuje się jako nowy szkic.
export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN", "MANAGER"]);
  if (deny) return deny;

  const parsed = CampaignInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad(parsed.error.issues[0]?.message ?? "Niepoprawne dane");

  const existing = await prisma.newsletterCampaign.findUnique({ where: { id: params.id }, select: { status: true } });
  if (!existing) return bad("Nie znaleziono wiadomości", 404);
  if (existing.status !== "DRAFT") return bad("Wysłanej wiadomości nie można edytować — zapisz ją jako nowy szkic.", 409);

  await prisma.newsletterCampaign.update({
    where: { id: params.id },
    data: {
      subject: parsed.data.subject,
      preheader: parsed.data.preheader || null,
      html: sanitizeNewsletterHtml(parsed.data.html),
    },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN", "MANAGER"]);
  if (deny) return deny;

  const existing = await prisma.newsletterCampaign.findUnique({
    where: { id: params.id },
    select: { status: true, subject: true },
  });
  if (!existing) return bad("Nie znaleziono wiadomości", 404);
  if (existing.status !== "DRAFT") return bad("Wysłanej wiadomości nie można usunąć — zostaje w historii.", 409);

  await prisma.newsletterCampaign.delete({ where: { id: params.id } });
  await logAudit({
    actorId: user!.id,
    action: "DELETE",
    entity: "NewsletterCampaign",
    entityId: params.id,
    summary: `Usunięto szkic newslettera „${existing.subject}"`,
  });
  return NextResponse.json({ ok: true });
}
