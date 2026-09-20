import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { setPatientAuthCookie, signPatientToken } from "@/lib/patient-auth";
import { logAudit } from "@/lib/audit";

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

const BodySchema = z.object({
  phone: z.string().trim().regex(/^\+48\d{9}$/, "Podaj prawidłowy 9-cyfrowy numer telefonu"),
  password: z.string().min(1, "Podaj hasło"),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return bad(parsed.error.issues[0]?.message ?? "Uzupełnij poprawnie wszystkie pola");

  const { phone, password } = parsed.data;

  // Numer telefonu nie jest unikalny w skali całej kliniki (pacjent może mieć
  // kilka wizyt w różnych lokalizacjach pod tym samym numerem, historycznie
  // zapisanych jako osobne rekordy Patient) — logujemy do najnowszego konta
  // z ustawionym hasłem dla tego numeru.
  const patient = await prisma.patient.findFirst({
    where: { phone, passwordHash: { not: null } },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, phone: true, email: true, passwordHash: true },
  });

  if (!patient?.passwordHash) {
    await logAudit({
      actor: { type: "GUEST", contact: phone },
      action: "LOGIN_FAILED",
      entity: "PatientAccount",
      summary: `Nieudane logowanie do panelu klienta: brak konta dla numeru ${phone}`,
      data: { phone, reason: "unknown_account" },
    });
    return bad("Błędny numer telefonu lub hasło", 401);
  }

  const ok = await bcrypt.compare(password, patient.passwordHash);
  if (!ok) {
    await logAudit({
      actor: { type: "GUEST", name: patient.name, contact: phone },
      action: "LOGIN_FAILED",
      entity: "PatientAccount",
      entityId: patient.id,
      summary: `Nieudane logowanie do panelu klienta: błędne hasło (${patient.name}, ${phone})`,
      data: { phone, reason: "wrong_password" },
    });
    return bad("Błędny numer telefonu lub hasło", 401);
  }

  const token = await signPatientToken({
    id: patient.id,
    name: patient.name,
    phone: patient.phone,
    email: patient.email,
  });
  setPatientAuthCookie(token);

  await logAudit({
    actor: { type: "PATIENT", id: patient.id, name: patient.name, contact: patient.phone },
    action: "LOGIN",
    entity: "PatientAccount",
    entityId: patient.id,
    summary: "Logowanie do panelu klienta",
  });

  return NextResponse.json({ ok: true });
}
