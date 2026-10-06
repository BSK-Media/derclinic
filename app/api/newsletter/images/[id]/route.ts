import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Publiczny adres zdjęcia z newslettera — musi działać bez logowania, bo
// ładuje go klient poczty u odbiorcy. Id jest nieodgadywalne, a plik to
// wyłącznie obraz rastrowy (sprawdzany przy wgraniu).
export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const image = await prisma.newsletterImage.findUnique({
    where: { id: params.id },
    select: { mimeType: true, data: true },
  });
  if (!image) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(new Uint8Array(image.data), {
    headers: {
      "Content-Type": image.mimeType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
