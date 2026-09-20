import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getPatientAuth } from "@/lib/patient-auth";
import { logAudit } from "@/lib/audit";

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

const FIELD_LABELS = { NAME: "imię i nazwisko", PHONE: "telefon", EMAIL: "e-mail" } as const;

const FIELD_VALIDATORS: Record<"NAME" | "PHONE" | "EMAIL", z.ZodString> = {
  NAME: z.string().trim().min(2, "Podaj imię i nazwisko").max(100),
  PHONE: z.string().trim().regex(/^\+48\d{9}$/, "Podaj prawidłowy 9-cyfrowy numer telefonu"),
  EMAIL: z.string().trim().email("Podaj poprawny adres e-mail").max(200),
};

const BodySchema = z.object({
  field: z.enum(["NAME", "PHONE", "EMAIL"]),
  newValue: z.string().trim().min(1, "Podaj nową wartość"),
});

// Pacjent nie może sam edytować swoich danych kontaktowych w panelu klienta —
// zamiast tego wysyła prośbę, którą recepcja/admin akceptuje albo odrzuca
// (patrz PatientDataChangeRequest w schema.prisma).
export async function GET() {
  const auth = await getPatientAuth();
  if (!auth) return bad("Brak autoryzacji", 401);

  const requests = await prisma.patientDataChangeRequest.findMany({
    where: { patientId: auth.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return NextResponse.json({ ok: true, requests });
}

export async function POST(req: Request) {
  const auth = await getPatientAuth();
  if (!auth) return bad("Brak autoryzacji", 401);

  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return bad(parsed.error.issues[0]?.message ?? "Niepoprawne dane");

  const fieldValidator = FIELD_VALIDATORS[parsed.data.field];
  const valueParsed = fieldValidator.safeParse(parsed.data.newValue);
  if (!valueParsed.success) return bad(valueParsed.error.issues[0]?.message ?? "Niepoprawna wartość");
  const newValue = valueParsed.data;

  const patient = await prisma.patient.findUnique({
    where: { id: auth.id },
    select: { name: true, phone: true, email: true },
  });
  if (!patient) return bad("Nie znaleziono konta", 404);

  const currentValue =
    parsed.data.field === "NAME" ? patient.name : parsed.data.field === "PHONE" ? patient.phone : patient.email;

  if (currentValue === newValue) return bad("Podana wartość jest taka sama jak obecna");

  const existingPending = await prisma.patientDataChangeRequest.findFirst({
    where: { patientId: auth.id, field: parsed.data.field, status: "PENDING" },
  });
  if (existingPending) {
    return bad("Masz już oczekującą prośbę o zmianę tego pola — poczekaj na decyzję recepcji.", 409);
  }

  const request = await prisma.patientDataChangeRequest.create({
    data: {
      patientId: auth.id,
      field: parsed.data.field,
      currentValue,
      newValue,
    },
  });

  await logAudit({
    actor: { type: "PATIENT", id: auth.id, name: patient.name, contact: auth.phone },
    action: "CREATE",
    entity: "PatientDataChangeRequest",
    entityId: request.id,
    summary: `Prośba o zmianę danych (${FIELD_LABELS[parsed.data.field]}): „${currentValue ?? "—"}" → „${newValue}"`,
    data: { patientId: auth.id, field: parsed.data.field, currentValue, newValue },
  });

  return NextResponse.json({ ok: true, request });
}
