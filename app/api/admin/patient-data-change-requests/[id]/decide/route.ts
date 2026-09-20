import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";

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

const PATIENT_FIELD_MAP = { NAME: "name", PHONE: "phone", EMAIL: "email" } as const;

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN", "RECEPTION"]);
  if (deny) return deny;

  const json = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(json ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: parsed.error.issues[0]?.message ?? "Niepoprawne dane" },
      { status: 400 },
    );
  }

  const request = await prisma.patientDataChangeRequest.findUnique({ where: { id: params.id } });
  if (!request) return NextResponse.json({ ok: false, message: "Nie znaleziono prośby" }, { status: 404 });
  if (request.status !== "PENDING") {
    return NextResponse.json({ ok: false, message: "Ta prośba została już rozpatrzona." }, { status: 400 });
  }

  const target = parsed.data.action === "REJECT" ? "REJECTED" : "APPROVED";

  const updated = await prisma.$transaction(async (tx) => {
    if (target === "APPROVED") {
      const column = PATIENT_FIELD_MAP[request.field];
      const beforePatient = await tx.patient.findUnique({
        where: { id: request.patientId },
        select: { name: true, phone: true, email: true },
      });
      await tx.patient.update({
        where: { id: request.patientId },
        data: { [column]: request.newValue },
      });
      // Zmiana danych pacjenta to osobne zdarzenie — zapisujemy ją w tej samej transakcji.
      await logAudit({
        tx,
        actorId: user!.id,
        action: "UPDATE",
        entity: "Patient",
        entityId: request.patientId,
        summary: `Zmiana danych pacjenta ${beforePatient?.name ?? ""} po zaakceptowaniu prośby pacjenta (${column}): ${beforePatient?.[column] ?? "—"} → ${request.newValue}`,
        data: {
          requestId: request.id,
          changes: { [column]: { from: beforePatient?.[column] ?? null, to: request.newValue } },
        },
      });
    }

    return tx.patientDataChangeRequest.update({
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
    entity: "PatientDataChangeRequest",
    entityId: updated.id,
    summary:
      target === "APPROVED"
        ? `Akceptacja prośby pacjenta o zmianę danych (${request.field}): „${request.currentValue ?? "—"}" → „${request.newValue}"`
        : `Odrzucenie prośby pacjenta o zmianę danych (${request.field}: „${request.newValue}"); powód: ${parsed.data.reason!.trim()}`,
    data: {
      status: target,
      field: request.field,
      currentValue: request.currentValue,
      newValue: request.newValue,
      patientId: request.patientId,
    },
  });

  return NextResponse.json({ ok: true, request: updated });
}
