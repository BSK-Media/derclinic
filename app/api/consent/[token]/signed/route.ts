import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { consentLinkProblem, appointmentForConsentToken } from "@/lib/procedure-consent-server";

// Pobranie podpisanej zgody na zabieg (ostatni przyjęty plik) dla linku z tokenem.
export async function GET(_req: Request, props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const appointment = await appointmentForConsentToken(decodeURIComponent(params.token));
  if (!appointment) return NextResponse.json({ ok: false, message: await consentLinkProblem(decodeURIComponent(params.token)) }, { status: 404 });

  const submission = await prisma.procedureConsentSubmission.findFirst({
    where: { appointmentId: appointment.id, status: "ACCEPTED" },
    orderBy: { createdAt: "desc" },
    select: { fileName: true, mimeType: true, data: true },
  });
  if (!submission) {
    return NextResponse.json({ ok: false, message: "Brak podpisanej zgody do tej wizyty." }, { status: 404 });
  }

  const safeName = submission.fileName.replace(/[^\w.\- ]+/g, "_") || "zgoda-podpisana.pdf";
  return new NextResponse(new Uint8Array(submission.data), {
    headers: {
      "Content-Type": submission.mimeType || "application/pdf",
      "Content-Disposition": `attachment; filename="${safeName}"`,
      // Dane osobowe pacjenta: bez cache'owania.
      "Cache-Control": "private, no-store",
    },
  });
}
