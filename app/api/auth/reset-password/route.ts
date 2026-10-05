import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPasswordResetToken } from "@/lib/patient-auth";
import { revokeAllStaffSessions } from "@/lib/session-core";
import { logAudit } from "@/lib/audit";
import { validatePassword } from "@/lib/password-policy";
import { STAFF_BCRYPT_COST } from "@/lib/staff-credentials";
import { RATE_LIMITS, clientIp, hitRateLimit, tooManyRequests } from "@/lib/rate-limit";

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

const BodySchema = z.object({
  token: z.string().min(1).max(200),
  password: z.string().min(1, "Podaj hasło").max(500),
});

// Ustawienie nowego hasła pracownika linkiem z e-maila. Nie zakłada sesji —
// po zmianie hasła pracownik loguje się normalnie, razem z drugim składnikiem.
export async function POST(req: Request) {
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad(parsed.error.issues[0]?.message ?? "Uzupełnij poprawnie wszystkie pola");

  const ipLimit = await hitRateLimit(RATE_LIMITS.resetPasswordIp, await clientIp());
  if (!ipLimit.allowed) return tooManyRequests(ipLimit);

  const user = await prisma.user.findFirst({
    where: { passwordResetTokenHash: hashPasswordResetToken(parsed.data.token) },
    select: { id: true, login: true, name: true, email: true, passwordResetExpiresAt: true },
  });
  if (!user || !user.passwordResetExpiresAt || user.passwordResetExpiresAt.getTime() < Date.now()) {
    return bad("Link do resetu hasła jest nieprawidłowy albo wygasł. Poproś o nowy.");
  }

  const issue = validatePassword(parsed.data.password, { login: user.login, name: user.name, email: user.email });
  if (issue) return bad(issue);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await bcrypt.hash(parsed.data.password, STAFF_BCRYPT_COST),
      mustChangePassword: false,
      passwordResetTokenHash: null,
      passwordResetExpiresAt: null,
    },
  });

  // Nowe hasło unieważnia wszystkie dotychczasowe sesje tego konta.
  await revokeAllStaffSessions(user.id, "password_reset");

  await logAudit({
    actorId: user.id,
    action: "PASSWORD_RESET",
    entity: "User",
    entityId: user.id,
    summary: `Pracownik ustawił nowe hasło linkiem z e-maila (konto „${user.login}")`,
  });

  return NextResponse.json({ ok: true, login: user.login });
}
