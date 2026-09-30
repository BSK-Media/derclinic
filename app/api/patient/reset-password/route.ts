import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPasswordResetToken, startPatientSession } from "@/lib/patient-auth";
import { revokeAllPatientSessions } from "@/lib/session-core";
import { logAudit } from "@/lib/audit";
import { validatePassword } from "@/lib/password-policy";
import { RATE_LIMITS, clientIp, hitRateLimit, tooManyRequests } from "@/lib/rate-limit";

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

const BodySchema = z.object({
  token: z.string().min(1).max(200),
  password: z.string().min(1, "Podaj hasło").max(500),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return bad(parsed.error.issues[0]?.message ?? "Uzupełnij poprawnie wszystkie pola");

  const ipLimit = await hitRateLimit(RATE_LIMITS.resetPasswordIp, await clientIp());
  if (!ipLimit.allowed) return tooManyRequests(ipLimit);

  const { token, password } = parsed.data;
  const tokenHash = hashPasswordResetToken(token);

  const patient = await prisma.patient.findFirst({
    where: { passwordResetTokenHash: tokenHash },
    select: { id: true, name: true, phone: true, email: true, passwordResetExpiresAt: true },
  });

  if (!patient || !patient.passwordResetExpiresAt || patient.passwordResetExpiresAt.getTime() < Date.now()) {
    return bad("Link do resetu hasła jest nieprawidłowy albo wygasł. Poproś o nowy.", 400);
  }

  const passwordIssue = validatePassword(password, { name: patient.name, email: patient.email, phone: patient.phone });
  if (passwordIssue) return bad(passwordIssue);

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.patient.update({
    where: { id: patient.id },
    data: { passwordHash, passwordResetTokenHash: null, passwordResetExpiresAt: null },
  });

  // Nowe hasło unieważnia wszystkie dotychczasowe sesje (np. na zgubionym telefonie).
  await revokeAllPatientSessions(patient.id, "password_reset");
  await startPatientSession(patient.id);

  await logAudit({
    actor: { type: "PATIENT", id: patient.id, name: patient.name, contact: patient.phone },
    action: "PASSWORD_RESET",
    entity: "PatientAccount",
    entityId: patient.id,
    summary: "Ustawienie nowego hasła przez link z e-maila (reset hasła w panelu klienta)",
  });

  return NextResponse.json({ ok: true });
}
