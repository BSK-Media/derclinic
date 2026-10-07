import { NextResponse } from "next/server";
import {
  CONSENT_UPLOAD_MAX_BYTES,
  appointmentForConsentToken,
  consentLinkProblem,
  consentUploadBlocker,
  submitSignedConsent,
} from "@/lib/procedure-consent-server";
import { RATE_LIMITS, clientIp, hitRateLimit, tooManyRequests } from "@/lib/rate-limit";

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

// Wgranie podpisanej zgody. System sprawdza podpis i od razu zwraca wynik:
// ACCEPTED (przyjęta), REJECTED (odrzucona z powodem — można wgrać poprawny
// plik) albo PENDING_REVIEW (czeka na weryfikację personelu).
export const maxDuration = 30;

export async function POST(req: Request, props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const appointment = await appointmentForConsentToken(decodeURIComponent(params.token));
  if (!appointment) return bad(await consentLinkProblem(decodeURIComponent(params.token)), 404);

  const limit = await hitRateLimit(RATE_LIMITS.consentUploadIp, await clientIp());
  if (!limit.allowed) return tooManyRequests(limit);

  const blocker = consentUploadBlocker(appointment);
  if (blocker) return bad(blocker, 409);

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return bad("Wybierz podpisany plik.");
  if (file.size === 0) return bad("Plik jest pusty.");
  if (file.size > CONSENT_UPLOAD_MAX_BYTES) {
    return bad(`Plik jest za duży (maks. ${CONSENT_UPLOAD_MAX_BYTES / 1024 / 1024} MB).`, 413);
  }

  const verification = await submitSignedConsent(appointment, {
    name: file.name || "zgoda.pdf",
    mimeType: file.type || "application/octet-stream",
    bytes: new Uint8Array(await file.arrayBuffer()),
  });

  return NextResponse.json({
    ok: true,
    outcome: verification.outcome,
    reason: verification.reason,
    signer: typeof verification.details.signer === "string" ? verification.details.signer : null,
  });
}
