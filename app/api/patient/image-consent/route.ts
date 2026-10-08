import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getPatientAuth } from "@/lib/patient-auth";
import { logAudit } from "@/lib/audit";

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

const BodySchema = z.object({ appointmentId: z.string().min(1).max(100), granted: z.boolean() });

// Zgodę na wizerunek do konkretnego zabiegu pacjent może udzielić i cofnąć w panelu
// w dowolnym momencie (przed i po zabiegu), bez akceptacji personelu. Każda zmiana
// zapisuje ImageConsentChange, z którego personel dostaje powiadomienie w aplikacji
// (patrz app/api/notifications/route.ts). Zgoda z formularza rezerwacji tu nie wpada.
export async function POST(req: Request) {
  const auth = await getPatientAuth();
  if (!auth) return bad("Brak autoryzacji", 401);

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("Niepoprawne dane");

  const appointment = await prisma.appointment.findFirst({
    where: { id: parsed.data.appointmentId, patientId: auth.id, deletedAt: null },
    select: { id: true, imageConsent: true, customServiceName: true, service: { select: { name: true } } },
  });
  if (!appointment) return bad("Nie znaleziono wizyty", 404);

  // Bez zmiany stanu nic nie zapisujemy i nie powiadamiamy.
  if (appointment.imageConsent === parsed.data.granted) {
    return NextResponse.json({ ok: true, granted: appointment.imageConsent, changed: false });
  }

  const serviceName = appointment.customServiceName || appointment.service.name;
  await prisma.$transaction(async (tx) => {
    await tx.appointment.update({ where: { id: appointment.id }, data: { imageConsent: parsed.data.granted } });
    await tx.imageConsentChange.create({
      data: { appointmentId: appointment.id, patientId: auth.id, granted: parsed.data.granted },
    });
    // Zamknij ewentualne stare prośby o cofnięcie — zgoda jest teraz zmieniana bezpośrednio.
    if (!parsed.data.granted) {
      await tx.imageConsentRevocationRequest.updateMany({
        where: { appointmentId: appointment.id, status: "PENDING" },
        data: { status: "APPROVED", decidedAt: new Date() },
      });
    }
    await logAudit({
      tx,
      actor: { type: "PATIENT", id: auth.id, name: auth.name, contact: auth.phone },
      action: "UPDATE",
      entity: "ImageConsent",
      entityId: appointment.id,
      summary: `${parsed.data.granted ? "Udzielenie" : "Cofnięcie"} zgody na wizerunek w panelu klienta (zabieg: ${serviceName})`,
      data: { appointmentId: appointment.id, granted: parsed.data.granted },
    });
  });

  return NextResponse.json({ ok: true, granted: parsed.data.granted, changed: true });
}
