import { NextResponse, after } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getPatientAuth } from "@/lib/patient-auth";
import { logAudit } from "@/lib/audit";
import { appBaseUrl, notifyImageConsentRevocationRequest } from "@/lib/email-notifications";

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

const BodySchema = z.object({ appointmentId: z.string().min(1).max(100) });

// Klient nie cofa zgody na wizerunek sam — wysyła prośbę, którą recepcja albo
// admin akceptuje (zgoda zostaje cofnięta) lub odrzuca (patrz
// ImageConsentRevocationRequest w schema.prisma).
export async function POST(req: Request) {
  const auth = await getPatientAuth();
  if (!auth) return bad("Brak autoryzacji", 401);

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("Niepoprawne dane");

  const appointment = await prisma.appointment.findFirst({
    where: { id: parsed.data.appointmentId, patientId: auth.id, deletedAt: null },
    select: { id: true, imageConsent: true, startsAt: true, customServiceName: true, service: { select: { name: true } } },
  });
  if (!appointment) return bad("Nie znaleziono wizyty", 404);
  if (!appointment.imageConsent) return bad("Przy tym zabiegu nie ma zgody na wizerunek.", 409);

  const pending = await prisma.imageConsentRevocationRequest.findFirst({
    where: { appointmentId: appointment.id, status: "PENDING" },
    select: { id: true },
  });
  if (pending) return bad("Prośba o cofnięcie zgody przy tym zabiegu czeka już na decyzję recepcji.", 409);

  const request = await prisma.imageConsentRevocationRequest.create({
    data: { patientId: auth.id, appointmentId: appointment.id },
  });

  const serviceName = appointment.customServiceName || appointment.service.name;
  await logAudit({
    actor: { type: "PATIENT", id: auth.id, name: auth.name, contact: auth.phone },
    action: "CREATE",
    entity: "ImageConsentRevocationRequest",
    entityId: request.id,
    summary: `Prośba o cofnięcie zgody na wizerunek (zabieg: ${serviceName})`,
    data: { patientId: auth.id, appointmentId: appointment.id },
  });

  // Powiadomienie dla recepcji — po wysłaniu odpowiedzi.
  const baseUrl = appBaseUrl(req);
  after(() => notifyImageConsentRevocationRequest(request.id, { baseUrl }));

  return NextResponse.json({ ok: true, request });
}
