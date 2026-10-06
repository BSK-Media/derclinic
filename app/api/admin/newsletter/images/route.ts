import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { appBaseUrl } from "@/lib/email-notifications";
import { NEWSLETTER_IMAGE_MAX_BYTES, detectImageMime } from "@/lib/newsletter-images";

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

// Wgranie zdjęcia do newslettera z edytora. Zwraca pełny, publiczny adres
// obrazu — taki, jaki trafia do treści wiadomości e-mail.
export async function POST(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN", "MANAGER"]);
  if (deny) return deny;

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return bad("Wybierz plik ze zdjęciem.");
  if (file.size === 0) return bad("Plik jest pusty.");
  if (file.size > NEWSLETTER_IMAGE_MAX_BYTES) {
    return bad(`Zdjęcie jest za duże (maks. ${NEWSLETTER_IMAGE_MAX_BYTES / 1024 / 1024} MB).`, 413);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mimeType = detectImageMime(bytes);
  if (!mimeType) return bad("Dozwolone formaty: JPG, PNG, GIF i WebP.", 415);

  const image = await prisma.newsletterImage.create({
    data: { mimeType, size: bytes.length, data: Buffer.from(bytes), createdById: user!.id },
    select: { id: true },
  });

  await logAudit({
    actorId: user!.id,
    action: "CREATE",
    entity: "NewsletterImage",
    entityId: image.id,
    summary: `Wgrano zdjęcie do newslettera (${Math.round(bytes.length / 1024)} KB)`,
  });

  return NextResponse.json({ ok: true, url: `${appBaseUrl(req)}/api/newsletter/images/${image.id}` });
}
