import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/api-helpers";
import { getAuthUser } from "@/lib/auth-cookie";
import { CHAT_ACTIVE_USER, CHAT_IMAGE_MAX_BYTES, CHAT_MAX_BODY, CHAT_PAGE_SIZE, chatSenderLabel } from "@/lib/chat";
import { encryptBytes } from "@/lib/data-encryption";
import { detectImageMime } from "@/lib/newsletter-images";
import { RATE_LIMITS, hitRateLimit, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// Rozmowa z jedną osobą: ostatnie wiadomości w obie strony (najstarsze na górze). Pobranie rozmowy oznacza
// wiadomości od rozmówcy jako przeczytane.
export async function GET(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const withId = new URL(req.url).searchParams.get("with");
  if (!withId) return NextResponse.json({ ok: false, message: "Wybierz rozmówcę" }, { status: 400 });

  const other = await prisma.user.findFirst({ where: { id: withId }, select: { id: true, name: true, role: true } });
  if (!other) return NextResponse.json({ ok: false, message: "Nie znaleziono pracownika" }, { status: 404 });

  const rows = await prisma.staffMessage.findMany({
    where: {
      OR: [
        { senderId: user!.id, recipientId: other.id },
        { senderId: other.id, recipientId: user!.id },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: CHAT_PAGE_SIZE,
    select: { id: true, createdAt: true, senderId: true, senderOperatorName: true, body: true, readAt: true, image: { select: { id: true } } },
  });

  await prisma.staffMessage.updateMany({
    where: { senderId: other.id, recipientId: user!.id, readAt: null },
    data: { readAt: new Date() },
  });

  return NextResponse.json({
    ok: true,
    with: other,
    messages: rows.reverse().map((m) => ({
      id: m.id,
      createdAt: m.createdAt.toISOString(),
      mine: m.senderId === user!.id,
      from: m.senderId === user!.id ? null : chatSenderLabel(other.name, m.senderOperatorName),
      body: m.body,
      imageId: m.image?.id ?? null,
      readAt: m.readAt ? m.readAt.toISOString() : null,
    })),
  });
}

const BodyText = z
  .string()
  .transform((value) => value.trim())
  .pipe(z.string().max(CHAT_MAX_BODY, `Wiadomość może mieć najwyżej ${CHAT_MAX_BODY} znaków`));

// Wiadomość: JSON { to, body } albo multipart (to, body, image) ze zdjęciem. Wymagana jest treść lub zdjęcie.
export async function POST(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;

  let to = "";
  let rawBody = "";
  let image: { bytes: Uint8Array; mime: string } | null = null;

  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    if (!form) return NextResponse.json({ ok: false, message: "Niepoprawne dane" }, { status: 400 });
    to = String(form.get("to") ?? "");
    rawBody = String(form.get("body") ?? "");
    const file = form.get("image");
    if (file instanceof Blob && file.size > 0) {
      if (file.size > CHAT_IMAGE_MAX_BYTES) {
        return NextResponse.json({ ok: false, message: "Zdjęcie jest za duże (maksymalnie 4 MB)" }, { status: 413 });
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      const mime = detectImageMime(bytes);
      if (!mime) return NextResponse.json({ ok: false, message: "Dozwolone są zdjęcia JPG, PNG, GIF i WebP" }, { status: 400 });
      image = { bytes, mime };
    }
  } else {
    const json = (await req.json().catch(() => null)) as { to?: unknown; body?: unknown } | null;
    to = typeof json?.to === "string" ? json.to : "";
    rawBody = typeof json?.body === "string" ? json.body : "";
  }

  const bodyParsed = BodyText.safeParse(rawBody);
  if (!bodyParsed.success) {
    return NextResponse.json({ ok: false, message: bodyParsed.error.issues[0]?.message ?? "Niepoprawne dane" }, { status: 400 });
  }
  const body = bodyParsed.data;
  if (!to) return NextResponse.json({ ok: false, message: "Wybierz rozmówcę" }, { status: 400 });
  if (!body && !image) return NextResponse.json({ ok: false, message: "Wpisz wiadomość lub dodaj zdjęcie" }, { status: 400 });
  if (to === user!.id) return NextResponse.json({ ok: false, message: "Nie można pisać do samego siebie" }, { status: 400 });

  const limit = await hitRateLimit(RATE_LIMITS.chatSend, user!.id);
  if (!limit.allowed) return tooManyRequests(limit, "Zbyt wiele wiadomości. Spróbuj za chwilę.");

  const recipient = await prisma.user.findFirst({ where: { id: to, ...CHAT_ACTIVE_USER }, select: { id: true } });
  if (!recipient) return NextResponse.json({ ok: false, message: "Nie można wysłać wiadomości do tej osoby" }, { status: 404 });

  const message = await prisma.staffMessage.create({
    data: {
      senderId: user!.id,
      senderOperatorName: (await getAuthUser())?.operatorName ?? null,
      recipientId: recipient.id,
      body,
      ...(image
        ? { image: { create: { mimeType: image.mime, size: image.bytes.length, data: encryptBytes(image.bytes) } } }
        : {}),
    },
    select: { id: true, createdAt: true, body: true, image: { select: { id: true } } },
  });

  return NextResponse.json({
    ok: true,
    message: {
      id: message.id,
      createdAt: message.createdAt.toISOString(),
      mine: true,
      from: null,
      body: message.body,
      imageId: message.image?.id ?? null,
      readAt: null,
    },
  });
}
