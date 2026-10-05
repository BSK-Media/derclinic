import { NextResponse } from "next/server";

// Zdjęcia (wizyty, awatary) są trzymane w bazie jako data URL base64. Wklejone
// wprost w stronę ważą nawet kilka MB i blokują jej otwarcie, więc panel
// klienta pobiera je osobnym żądaniem — ten helper zamienia data URL na
// zwykłą odpowiedź binarną z obrazem.
export function dataUrlToImageResponse(value: string | null | undefined) {
  if (!value) return new NextResponse(null, { status: 404 });

  const match = /^data:(image\/(?:jpeg|jpg|png|webp));base64,/i.exec(value);
  if (!match) {
    // Zwykły adres obrazu (nie data URL) — przekierowujemy do niego.
    if (/^https:\/\//i.test(value)) return NextResponse.redirect(value);
    return new NextResponse(null, { status: 404 });
  }

  const bytes = Buffer.from(value.slice(match[0].length), "base64");
  return new NextResponse(bytes, {
    headers: { "content-type": match[1].toLowerCase(), "content-length": String(bytes.length) },
  });
}
