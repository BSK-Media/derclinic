import { NextResponse, after } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { appBaseUrl, notifyImageConsentDecision } from "@/lib/email-notifications";

const BodySchema = z
  .object({
    action: z.enum(["APPROVE", "REJECT"]),
    reason: z.string().trim().max(500).optional().or(z.literal("")),
  })
  .superRefine((value, ctx) => {
    if (value.action === "REJECT" && (!value.reason || value.reason.trim().length < 3)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reason"],
        message: "Podaj powód odrzucenia prośby",
      });
    }
  });

export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN", "RECEPTION"]);
  if (deny) return deny;

  const parsed = BodySchema.safeParse((await req.json().catch(() => ({}))) ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: parsed.error.issues[0]?.message ?? "Niepoprawne dane" },
      { status: 400 },
    );
  }

  const request = await prisma.imageConsentRevocationRequest.findUnique({
    where: { id: params.id },
    include: {
      patient: { select: { name: true } },
      appointment: { select: { customServiceName: true, service: { select: { name: true } } } },
    },
  });
  if (!request) return NextResponse.json({ ok: false, message: "Nie znaleziono prośby" }, { status: 404 });
  if (request.status !== "PENDING") {
    return NextResponse.json({ ok: false, message: "Ta prośba została już rozpatrzona." }, { status: 400 });
  }

  const target = parsed.data.action === "REJECT" ? "REJECTED" : "APPROVED";
  const serviceName = request.appointment.customServiceName || request.appointment.service.name;

  const updated = await prisma.$transaction(async (tx) => {
    if (target === "APPROVED") {
      await tx.appointment.update({ where: { id: request.appointmentId }, data: { imageConsent: false } });
      await logAudit({
        tx,
        actorId: user!.id,
        action: "UPDATE",
        entity: "Appointment",
        entityId: request.appointmentId,
        summary: `Cofnięto zgodę na wizerunek (${request.patient.name}, zabieg: ${serviceName}) po zaakceptowaniu prośby klienta`,
        data: { requestId: request.id, changes: { imageConsent: { from: true, to: false } } },
      });
    }
    return tx.imageConsentRevocationRequest.update({
      where: { id: request.id },
      data: {
        status: target,
        decidedAt: new Date(),
        decidedById: user!.id,
        rejectionReason: target === "REJECTED" ? parsed.data.reason!.trim() : null,
      },
    });
  });

  await logAudit({
    actorId: user!.id,
    action: "UPDATE",
    entity: "ImageConsentRevocationRequest",
    entityId: updated.id,
    summary:
      target === "APPROVED"
        ? `Akceptacja prośby o cofnięcie zgody na wizerunek (${request.patient.name}, zabieg: ${serviceName})`
        : `Odrzucenie prośby o cofnięcie zgody na wizerunek (${request.patient.name}, zabieg: ${serviceName}); powód: ${parsed.data.reason!.trim()}`,
    data: { status: target, patientId: request.patientId, appointmentId: request.appointmentId },
  });

  const baseUrl = appBaseUrl(req);
  after(() => notifyImageConsentDecision(updated.id, { baseUrl }));

  return NextResponse.json({ ok: true, request: updated });
}
