import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/api-helpers";
import { getAuthUser } from "@/lib/auth-cookie";
import { CHAT_ACTIVE_USER, CHAT_MAX_BODY, CHAT_PAGE_SIZE, chatSenderLabel } from "@/lib/chat";
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
    select: { id: true, createdAt: true, senderId: true, senderOperatorName: true, body: true, readAt: true },
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
      readAt: m.readAt ? m.readAt.toISOString() : null,
    })),
  });
}

const SendSchema = z.object({
  to: z.string().min(1).max(100),
  body: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().min(1, "Wpisz wiadomość").max(CHAT_MAX_BODY, `Wiadomość może mieć najwyżej ${CHAT_MAX_BODY} znaków`)),
});

export async function POST(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const parsed = SendSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: parsed.error.issues[0]?.message ?? "Niepoprawne dane" }, { status: 400 });
  }
  if (parsed.data.to === user!.id) {
    return NextResponse.json({ ok: false, message: "Nie można pisać do samego siebie" }, { status: 400 });
  }

  const limit = await hitRateLimit(RATE_LIMITS.chatSend, user!.id);
  if (!limit.allowed) return tooManyRequests(limit, "Zbyt wiele wiadomości. Spróbuj za chwilę.");

  const recipient = await prisma.user.findFirst({
    where: { id: parsed.data.to, ...CHAT_ACTIVE_USER },
    select: { id: true },
  });
  if (!recipient) return NextResponse.json({ ok: false, message: "Nie można wysłać wiadomości do tej osoby" }, { status: 404 });

  const message = await prisma.staffMessage.create({
    data: {
      senderId: user!.id,
      senderOperatorName: (await getAuthUser())?.operatorName ?? null,
      recipientId: recipient.id,
      body: parsed.data.body,
    },
    select: { id: true, createdAt: true, body: true },
  });

  return NextResponse.json({
    ok: true,
    message: { id: message.id, createdAt: message.createdAt.toISOString(), mine: true, from: null, body: message.body, readAt: null },
  });
}
