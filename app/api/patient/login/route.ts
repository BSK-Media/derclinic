import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { setPatientAuthCookie, signPatientToken } from "@/lib/patient-auth";
import { logAudit } from "@/lib/audit";
import {
  RATE_LIMITS,
  clientIp,
  failureDelay,
  hitRateLimit,
  peekRateLimit,
  resetRateLimit,
  tooManyRequests,
} from "@/lib/rate-limit";

// Hash losowego ciągu — porównujemy z nim hasło, gdy konto nie istnieje, żeby
// czas odpowiedzi nie zdradzał, czy numer ma konto.
const DUMMY_HASH = "$2a$10$/NEPJVneyvWB1YSAn..YueZNEeW93B6gbmm82Pg/4iLzAwzWIU6Fe";

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

const BodySchema = z.object({
  phone: z.string().trim().regex(/^\+48\d{9}$/, "Podaj prawidłowy 9-cyfrowy numer telefonu"),
  password: z.string().min(1, "Podaj hasło").max(500),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return bad(parsed.error.issues[0]?.message ?? "Uzupełnij poprawnie wszystkie pola");

  const { phone, password } = parsed.data;

  const ipLimit = await hitRateLimit(RATE_LIMITS.patientLoginIp, await clientIp());
  if (!ipLimit.allowed) return tooManyRequests(ipLimit);
  const accountLimit = await peekRateLimit(RATE_LIMITS.patientLoginAccount, phone);
  if (!accountLimit.allowed) {
    return tooManyRequests(
      accountLimit,
      `Zbyt wiele nieudanych prób logowania na ten numer. Spróbuj ponownie za ${Math.ceil(accountLimit.retryAfterSec / 60)} min.`,
    );
  }

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
    await bcrypt.compare(password, DUMMY_HASH);
    const failures = await hitRateLimit(RATE_LIMITS.patientLoginAccount, phone);
    await logAudit({
      actor: { type: "GUEST", contact: phone },
      action: "LOGIN_FAILED",
      entity: "PatientAccount",
      summary: `Nieudane logowanie do panelu klienta: brak konta dla numeru ${phone}`,
      data: { phone, reason: "unknown_account" },
    });
    await failureDelay(failures.count);
    return bad("Błędny numer telefonu lub hasło", 401);
  }

  const ok = await bcrypt.compare(password, patient.passwordHash);
  if (!ok) {
    const failures = await hitRateLimit(RATE_LIMITS.patientLoginAccount, phone);
    await logAudit({
      actor: { type: "GUEST", name: patient.name, contact: phone },
      action: "LOGIN_FAILED",
      entity: "PatientAccount",
      entityId: patient.id,
      summary: `Nieudane logowanie do panelu klienta: błędne hasło (${patient.name}, ${phone})`,
      data: { phone, reason: "wrong_password" },
    });
    await failureDelay(failures.count);
    return bad("Błędny numer telefonu lub hasło", 401);
  }

  await resetRateLimit(RATE_LIMITS.patientLoginAccount, phone);

  const token = await signPatientToken({
    id: patient.id,
    name: patient.name,
    phone: patient.phone,
    email: patient.email,
  });
  await setPatientAuthCookie(token);

  await logAudit({
    actor: { type: "PATIENT", id: patient.id, name: patient.name, contact: patient.phone },
    action: "LOGIN",
    entity: "PatientAccount",
    entityId: patient.id,
    summary: "Logowanie do panelu klienta",
  });

  return NextResponse.json({ ok: true });
}
