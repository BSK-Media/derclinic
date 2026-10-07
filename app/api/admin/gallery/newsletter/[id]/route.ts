import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { requireStepUp } from "@/lib/mfa";

// Usunięcie zdjęcia wgranego w edytorze newslettera. Wiadomości, które go
// używają (także już wysłane), przestaną je pokazywać — galeria ostrzega o tym
// przed potwierdzeniem.
export async function DELETE(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN"]);
  if (deny) return deny;
  const stepUp = requireStepUp(user!);
  if (stepUp) return stepUp;

  const image = await prisma.newsletterImage.findUnique({ where: { id: params.id }, select: { id: true, size: true } });
  if (!image) return NextResponse.json({ ok: false, message: "Nie znaleziono zdjęcia" }, { status: 404 });

  await prisma.newsletterImage.delete({ where: { id: image.id } });
  await logAudit({
    actorId: user!.id,
    action: "DELETE",
    entity: "NewsletterImage",
    entityId: image.id,
    summary: `Usunięto zdjęcie newslettera z galerii (${Math.round(image.size / 1024)} KB)`,
  });
  return NextResponse.json({ ok: true });
}
