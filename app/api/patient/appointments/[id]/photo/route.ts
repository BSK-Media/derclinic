import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getPatientAuth } from "@/lib/patient-auth";
import { dataUrlToImageResponse } from "@/lib/data-url-response";

// Zdjęcie przed/po z karty wizyty w panelu klienta (?slot=before|after).
// Ważne: wizyta jest szukana WYŁĄCZNIE po (id, patientId) zalogowanego
// pacjenta — nie da się pobrać zdjęcia z cudzej wizyty, nawet znając jej id.
export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await getPatientAuth();
  if (!auth) return NextResponse.json({ ok: false, message: "Brak autoryzacji" }, { status: 401 });

  const slot = new URL(req.url).searchParams.get("slot");
  if (slot !== "before" && slot !== "after") {
    return NextResponse.json({ ok: false, message: "Niepoprawne dane" }, { status: 400 });
  }

  // Wybieramy tylko jedno z dwóch zdjęć — drugie to kolejne megabajty z bazy.
  const where = { id: params.id, patientId: auth.id, deletedAt: null };
  const photo =
    slot === "before"
      ? (await prisma.appointment.findFirst({ where, select: { photoBefore: true } }))?.photoBefore
      : (await prisma.appointment.findFirst({ where, select: { photoAfter: true } }))?.photoAfter;

  return dataUrlToImageResponse(photo);
}
