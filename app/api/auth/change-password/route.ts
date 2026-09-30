import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { setAuthCookie, signAuthToken } from "@/lib/auth-cookie";
import { logAudit } from "@/lib/audit";
import { normalizeSidebarPermissions } from "@/lib/sidebar-permissions";
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

  await setAuthCookie(
    await signAuthToken({
      id: user.id,
      email: user.email ?? `${user.login}@local`,
      name: user.name,
      role: user.role as any,
      sidebarPermissions: normalizeSidebarPermissions(user.role, user.sidebarPermissions),
    }),
  );

  await logAudit({
    actorId: user.id,
    action: "LOGIN",
    entity: "User",
    entityId: user.id,
    summary: `Logowanie do panelu po zmianie hasła (konto „${user.login}")`,
  });

  return NextResponse.json({ ok: true });
}
