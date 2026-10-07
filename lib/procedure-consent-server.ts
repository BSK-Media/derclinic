import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import {
  appointmentIdFromConsentToken,
  buildConsentPdf,
  verifySignedConsent,
  type ConsentVerification,
} from "@/lib/procedure-consent";

// Warstwa serwerowa zgody na zabieg: wczytanie wizyty po tokenie, czcionki do
// PDF i przyjęcie podpisanego pliku od pacjenta.

export const CONSENT_UPLOAD_MAX_BYTES = 6 * 1024 * 1024;

let fontCache: { regular: Uint8Array; bold: Uint8Array } | null = null;

/** Czcionki z polskimi znakami (DejaVu) — leżą w public/fonts i są pobierane raz na instancję. */
export async function loadConsentFonts(baseUrl: string) {
  if (fontCache) return fontCache;
  const base = baseUrl.replace(/\/+$/, "");
  const [regular, bold] = await Promise.all(
    ["DejaVuSans.ttf", "DejaVuSans-Bold.ttf"].map(async (file) => {
      const res = await fetch(`${base}/fonts/${file}`);
      if (!res.ok) throw new Error(`Nie udało się pobrać czcionki ${file}`);
      return new Uint8Array(await res.arrayBuffer());
    }),
  );
  fontCache = { regular, bold };
  return fontCache;
}

const appointmentSelect = {
  id: true,
  startsAt: true,
  status: true,
  deletedAt: true,
  consentStatus: true,
  consentSignedAt: true,
  consentRejectionReason: true,
  consentForfeitedAt: true,
  customServiceName: true,
  patient: { select: { id: true, name: true } },
  specialist: { select: { name: true } },
  service: { select: { name: true } },
  location: { select: { name: true } },
} as const;

/** Wizyta wskazana tokenem z linku do zgody (null, gdy token jest niepoprawny albo wizyty nie ma). */
export async function appointmentForConsentToken(token: string) {
  const id = appointmentIdFromConsentToken(token);
  if (!id) return null;
  const appointment = await prisma.appointment.findFirst({ where: { id, deletedAt: null }, select: appointmentSelect });
  return appointment;
}

export type ConsentAppointment = NonNullable<Awaited<ReturnType<typeof appointmentForConsentToken>>>;

export async function consentPdfFor(appointment: ConsentAppointment, baseUrl: string) {
  return buildConsentPdf(
    {
      appointmentId: appointment.id,
      patientName: appointment.patient.name,
      serviceName: appointment.customServiceName || appointment.service.name,
      specialistName: appointment.specialist.name,
      locationName: appointment.location?.name ?? null,
      startsAt: appointment.startsAt,
    },
    await loadConsentFonts(baseUrl),
  );
}

/** Czy pacjent może jeszcze złożyć zgodę: wizyta aktywna, nie rozpoczęta i bez przyjętej zgody. */
export function consentUploadBlocker(appointment: ConsentAppointment, now = new Date()): string | null {
  if (appointment.status === "CANCELED") {
    return appointment.consentForfeitedAt
      ? "Rezerwacja została anulowana, bo zgoda nie została podpisana na czas."
      : "Ta rezerwacja została anulowana.";
  }
  if (appointment.consentStatus === "NOT_REQUIRED") return "Do tej wizyty zgoda nie jest wymagana.";
  if (appointment.consentStatus === "SIGNED") return "Zgoda do tej wizyty jest już podpisana.";
  if (appointment.startsAt.getTime() <= now.getTime()) return "Termin zabiegu już minął — nie można złożyć zgody.";
  return null;
}

/**
 * Przyjmuje plik z podpisaną zgodą: weryfikuje podpis, zapisuje próbę i
 * ustawia status wizyty (SIGNED / PENDING_REVIEW / dalej NOT_SIGNED z powodem).
 */
export async function submitSignedConsent(
  appointment: ConsentAppointment,
  file: { name: string; mimeType: string; bytes: Uint8Array },
): Promise<ConsentVerification> {
  const verification = await verifySignedConsent(file.bytes, appointment.id);

  await prisma.$transaction(async (tx) => {
    await tx.procedureConsentSubmission.create({
      data: {
        appointmentId: appointment.id,
        fileName: file.name.slice(0, 200),
        mimeType: file.mimeType.slice(0, 100),
        size: file.bytes.length,
        data: Buffer.from(file.bytes),
        status: verification.outcome,
        reason: verification.reason,
        details: verification.details as object,
      },
    });
    const now = new Date();
    await tx.appointment.update({
      where: { id: appointment.id },
      data:
        verification.outcome === "ACCEPTED"
          ? { consentStatus: "SIGNED", consentSignedAt: now, consentRejectionReason: null }
          : verification.outcome === "PENDING_REVIEW"
            ? { consentStatus: "PENDING_REVIEW", consentRejectionReason: null }
            : { consentStatus: "NOT_SIGNED", consentRejectionReason: verification.reason },
    });
    await logAudit({
      tx,
      actor: { type: "PATIENT", id: appointment.patient.id, name: appointment.patient.name },
      action: "UPDATE",
      entity: "ProcedureConsent",
      entityId: appointment.id,
      summary:
        verification.outcome === "ACCEPTED"
          ? "Zgoda na zabieg: podpisany dokument przyjęty (podpis zweryfikowany)"
          : verification.outcome === "PENDING_REVIEW"
            ? `Zgoda na zabieg: dokument złożony, czeka na weryfikację personelu (${verification.reason})`
            : `Zgoda na zabieg: dokument odrzucony (${verification.reason})`,
      data: { outcome: verification.outcome, reason: verification.reason, ...verification.details },
    });
  });

  return verification;
}
