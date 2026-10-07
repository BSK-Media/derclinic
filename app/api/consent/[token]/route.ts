import { NextResponse } from "next/server";
import { appointmentForConsentToken, consentUploadBlocker } from "@/lib/procedure-consent-server";
import { CONSENT_FORFEIT_WARNING, CONSENT_STATUS_LABELS, GOV_SIGN_URL } from "@/lib/procedure-consent";

// Stan zgody na zabieg dla linku z tokenem (strona /zgoda/<token>): dane
// wizyty, status, termin graniczny i to, czy można jeszcze wgrać plik.
export async function GET(_req: Request, props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const appointment = await appointmentForConsentToken(decodeURIComponent(params.token));
  if (!appointment) return NextResponse.json({ ok: false, message: "Nieprawidłowy link" }, { status: 404 });

  const blocker = consentUploadBlocker(appointment);
  return NextResponse.json({
    ok: true,
    appointment: {
      serviceName: appointment.customServiceName || appointment.service.name,
      specialistName: appointment.specialist.name,
      locationName: appointment.location?.name ?? null,
      startsAt: appointment.startsAt,
      canceled: appointment.status === "CANCELED",
      forfeited: Boolean(appointment.consentForfeitedAt),
    },
    consent: {
      status: appointment.consentStatus,
      statusLabel: CONSENT_STATUS_LABELS[appointment.consentStatus] ?? appointment.consentStatus,
      signedAt: appointment.consentSignedAt,
      rejectionReason: appointment.consentRejectionReason,
      // Do chwili zabiegu.
      deadline: appointment.startsAt,
      canUpload: blocker === null,
      blockedReason: blocker,
      warning: CONSENT_FORFEIT_WARNING,
      govSignUrl: GOV_SIGN_URL,
    },
  });
}
