import { NextResponse } from "next/server";
import { appBaseUrl } from "@/lib/email-notifications";
import { appointmentForConsentToken, consentLinkProblem, consentPdfFor } from "@/lib/procedure-consent-server";

// Pobranie zgody na zabieg (PDF do podpisania) dla linku z tokenem.
export async function GET(req: Request, props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const appointment = await appointmentForConsentToken(decodeURIComponent(params.token));
  if (!appointment) return NextResponse.json({ ok: false, message: await consentLinkProblem(decodeURIComponent(params.token)) }, { status: 404 });
  if (appointment.consentStatus === "NOT_REQUIRED") {
    return NextResponse.json({ ok: false, message: "Do tej wizyty zgoda nie jest wymagana." }, { status: 404 });
  }

  const pdf = await consentPdfFor(appointment, appBaseUrl(req));
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="zgoda-na-zabieg-derclinic.pdf"',
      // Dane osobowe pacjenta: bez cache'owania.
      "Cache-Control": "private, no-store",
    },
  });
}
