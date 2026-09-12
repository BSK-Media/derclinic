import { NextResponse } from "next/server";
import { getPatientAuth } from "@/lib/patient-auth";
import { prisma } from "@/lib/db";

// Lekki endpoint dla formularza rezerwacji online (i innych klienckich
// widoków) do sprawdzenia, czy w przeglądarce jest aktywna sesja pacjenta —
// bez konieczności renderowania całej strony panelu klienta po stronie serwera.
export async function GET() {
  const patient = await getPatientAuth();
  if (!patient) return NextResponse.json({ ok: false, patient: null });

  // Saldo punktów lojalnościowych pobieramy zawsze świeże z bazy — token
  // sesji jest ważny 30 dni i nie powinien "zamrażać" salda z dnia logowania.
  const fresh = await prisma.patient.findUnique({
    where: { id: patient.id },
    select: { loyaltyPoints: true },
  });

  return NextResponse.json({ ok: true, patient: { ...patient, loyaltyPoints: fresh?.loyaltyPoints ?? 0 } });
}
