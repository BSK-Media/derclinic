import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/api-helpers";
import { decryptBytes } from "@/lib/data-encryption";

export const dynamic = "force-dynamic";

// Zdjęcie z czatu: tylko dla nadawcy i adresata wiadomości. Plik jest zaszyfrowany w bazie, a odpowiedź nie trafia
// do współdzielonych pamięci podręcznych (może przedstawiać pacjenta).
export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { user, error } = await requireAuth();
  if (error) return error;

  const image = await prisma.staffMessageImage.findFirst({
    where: {
      id: params.id,
      message: { OR: [{ senderId: user!.id }, { recipientId: user!.id }] },
    },
    select: { mimeType: true, data: true },
  });
  if (!image) return new NextResponse("Not found", { status: 404 });

  const bytes = decryptBytes(image.data);
  if (!bytes) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": image.mimeType,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
