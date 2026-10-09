import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getPatientAuth } from "@/lib/patient-auth";
import { logAudit } from "@/lib/audit";
import { RATE_LIMITS, hitRateLimit, tooManyRequests } from "@/lib/rate-limit";

// Kopia danych pacjenta (art. 15 i 20 RODO): plik JSON z kartą, zgodami, wizytami, płatnościami,
// punktami i wnioskami. Zdjęcia z wizyt nie są dołączane (są dostępne w panelu przy wizycie).
// Wyłącznie dane zalogowanego pacjenta.
export async function GET() {
  const auth = await getPatientAuth();
  if (!auth) return NextResponse.json({ ok: false, message: "Brak autoryzacji" }, { status: 401 });

  const limit = await hitRateLimit(RATE_LIMITS.patientExport, auth.id);
  if (!limit.allowed) return tooManyRequests(limit);

  const patient = await prisma.patient.findUnique({
    where: { id: auth.id },
    select: {
      id: true,
      createdAt: true,
      name: true,
      phone: true,
      email: true,
      loyaltyPoints: true,
      processingRestrictedAt: true,
      location: { select: { name: true } },
      consents: { select: { type: true, granted: true, grantedAt: true, revokedAt: true } },
      consentEvents: { orderBy: { createdAt: "asc" }, select: { type: true, granted: true, createdAt: true } },
      loyaltyPointsTransactions: { orderBy: { createdAt: "asc" }, select: { createdAt: true, type: true, points: true, note: true } },
      dataChangeRequests: { orderBy: { createdAt: "asc" }, select: { createdAt: true, field: true, currentValue: true, newValue: true, status: true, decidedAt: true, rejectionReason: true } },
      appointments: {
        where: { deletedAt: null, service: { name: { not: "__DERCLINIC_REZERWACJA_CZASU__" } } },
        orderBy: { startsAt: "asc" },
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          status: true,
          customServiceName: true,
          service: { select: { name: true } },
          specialist: { select: { name: true } },
          location: { select: { name: true } },
          priceEstimate: true,
          priceFinal: true,
          note: true,
          imageConsent: true,
          consentStatus: true,
          consentSignedAt: true,
          invoiceRequested: true,
          invoiceNip: true,
          invoiceCompanyName: true,
          invoiceAddress: true,
          termsVersion: true,
          privacyVersion: true,
          photoBefore: true,
          photoAfter: true,
          payments: { select: { createdAt: true, method: true, amount: true } },
          consumptions: {
            where: { kind: "APPOINTMENT" },
            select: { quantity: true, unit: true, product: { select: { name: true } }, lotAllocations: true },
          },
        },
      },
      retailSales: {
        orderBy: { createdAt: "asc" },
        select: {
          createdAt: true,
          total: true,
          documentType: true,
          items: { select: { quantity: true, unitPrice: true, product: { select: { name: true } } } },
        },
      },
    },
  });
  if (!patient) return NextResponse.json({ ok: false, message: "Nie znaleziono konta" }, { status: 404 });

  const { appointments, ...rest } = patient;
  const payload = {
    generatedAt: new Date().toISOString(),
    description:
      "Kopia danych osobowych przetwarzanych przez DerClinic (art. 15 i 20 RODO). Zdjęcia z wizyt dostępne są w panelu klienta przy każdej wizycie.",
    ...rest,
    appointments: appointments.map(({ photoBefore, photoAfter, ...a }) => ({
      ...a,
      service: a.customServiceName || a.service.name,
      specialist: a.specialist.name,
      location: a.location.name,
      hasPhotoBefore: Boolean(photoBefore),
      hasPhotoAfter: Boolean(photoAfter),
    })),
  };

  await logAudit({
    actor: { type: "PATIENT", id: auth.id, name: auth.name, contact: auth.phone },
    action: "EXPORT",
    entity: "PatientData",
    entityId: auth.id,
    summary: "Klient pobrał kopię swoich danych z panelu klienta",
    data: { appointments: appointments.length },
  });

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="moje-dane-derclinic.json"',
      "Cache-Control": "private, no-store",
    },
  });
}
