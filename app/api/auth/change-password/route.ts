import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { respondMfaRequired } from "@/lib/mfa";
import { revokeAllStaffSessions } from "@/lib/session-core";
import { validatePassword } from "@/lib/password-policy";
import { STAFF_BCRYPT_COST, verifyStaffCredentials } from "@/lib/staff-credentials";

// Zmiana hasła przez samego pracownika — używana przy logowaniu, gdy hasło
// jest tymczasowe albo nie spełnia polityki. Wymaga podania obecnego hasła,
// więc nie potrzebuje sesji (tej pracownik jeszcze nie ma).
const BodySchema = z.object({
  login: z.string().trim().min(1).max(200),
  currentPassword: z.string().min(1).max(500),
  newPassword: z.string().min(1).max(500),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, message: "Niepoprawne dane" }, { status: 400 });

  const { login, currentPassword, newPassword } = parsed.data;

  const verified = await verifyStaffCredentials(login, currentPassword, "zmiana hasła");
  if (verified.response) return verified.response;
  const { user } = verified;

  const issue = validatePassword(newPassword, { login: user.login, name: user.name, email: user.email });
  if (issue) return NextResponse.json({ ok: false, message: issue }, { status: 400 });
  if (await bcrypt.compare(newPassword, user.passwordHash)) {
    return NextResponse.json({ ok: false, message: "Nowe hasło musi być inne niż obecne" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(newPassword, STAFF_BCRYPT_COST), mustChangePassword: false },
  });

  await logAudit({
    actorId: user.id,
    action: "PASSWORD_CHANGE",
    entity: "User",
    entityId: user.id,
    summary: `Pracownik ustawił nowe hasło (konto „${user.login}")`,
    data: { wasTemporary: user.mustChangePassword },
  });

  // Zmiana hasła unieważnia wszystkie dotychczasowe sesje tego konta.
  await revokeAllStaffSessions(user.id, "password_change");

  // Dalej tak jak przy logowaniu: sesja dopiero po drugim składniku (MFA).
  return await respondMfaRequired(user);
}
