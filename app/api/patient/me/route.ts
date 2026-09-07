import { NextResponse } from "next/server";
import { getPatientAuth } from "@/lib/patient-auth";

// Lekki endpoint dla formularza rezerwacji online (i innych klienckich
// widoków) do sprawdzenia, czy w przeglądarce jest aktywna sesja pacjenta —
// bez konieczności renderowania całej strony panelu klienta po stronie serwera.
export async function GET() {
  const patient = await getPatientAuth();
  if (!patient) return NextResponse.json({ ok: false, patient: null });
  return NextResponse.json({ ok: true, patient });
}
