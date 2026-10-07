import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { pushContent, sendPushToPatient } from "@/lib/push";
import { consentPageUrl } from "@/lib/consent-link";

const BodySchema = z
  .object({
    action: z.enum(["APPROVE", "REJECT"]),
    reason: z.string().trim().max(300).optional().or(z.literal("")),
  })
  .superRefine((value, ctx) => {
    if (value.action === "REJECT" && (!value.reason || value.reason.length < 3)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["reason"], message: "Podaj powód odrzucenia zgody" });
    }
  });

// Decyzja personelu o zgodzie: zatwierdzenie (np. dokument sprawdzony ręcznie
// albo papierowy skan) albo odrzucenie z powodem — pacjent dostaje powiadomienie
// i może wgrać plik ponownie.
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN", "MANAGER", "RECEPTION"]);
  if (deny) return deny;

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: parsed.error.issues[0]?.message ?? "Niepoprawne dane" }, { status: 400 });
  }

  const appointment = await prisma.appointment.findFirst({
    where: { id: params.id, deletedAt: null, ...(user!.locationScopeId ? { locationId: user!.locationScopeId } : {}) },
    select: {
      id: true,
      status: true,
      consentStatus: true,
      patientId: true,
      patient: { select: { name: true } },
      consentSubmissions: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true } },
    },
  });
  if (!appointment) return NextResponse.json({ ok: false, message: "Nie znaleziono wizyty" }, { status: 404 });
  if (appointment.consentStatus === "NOT_REQUIRED") {
    return NextResponse.json({ ok: false, message: "Do tej wizyty zgoda nie jest wymagana." }, { status: 400 });
  }
  if (appointment.status === "CANCELED") {
    return NextResponse.json({ ok: false, message: "Wizyta jest anulowana." }, { status: 409 });
  }

  const { action, reason } = parsed.data;
  const approve = action === "APPROVE";
  const latest = appointment.consentSubmissions[0];

  await prisma.$transaction(async (tx) => {
    await tx.appointment.update({
      where: { id: appointment.id },
      data: approve
        ? { consentStatus: "SIGNED", consentSignedAt: new Date(), consentRejectionReason: null }
        : { consentStatus: "NOT_SIGNED", consentRejectionReason: reason },
    });
    if (latest) {
      await tx.procedureConsentSubmission.update({
        where: { id: latest.id },
        data: { status: approve ? "ACCEPTED" : "REJECTED", reason: approve ? null : reason, decidedById: user!.id },
      });
    }
    await logAudit({
      tx,
      actorId: user!.id,
      action: "UPDATE",
      entity: "ProcedureConsent",
      entityId: appointment.id,
      summary: approve
        ? `Zgoda na zabieg zatwierdzona ręcznie (${appointment.patient.name})`
        : `Zgoda na zabieg odrzucona przez personel (${appointment.patient.name}); powód: ${reason}`,
      data: { action, reason: reason || null },
    });
  });

  if (!approve) {
    await sendPushToPatient(
      appointment.patientId,
      pushContent.consentRejected(consentPageUrl("", appointment.id), reason || null),
      { type: "PATIENT_CONSENT_REMINDER", recipientLabel: appointment.patient.name, appointmentId: appointment.id },
    );
  }

  return NextResponse.json({ ok: true });
}
