import { NextResponse } from "next/server";
import { z } from "zod";
import { setAuthCookie, signAuthToken } from "@/lib/auth-cookie";
import { logAudit } from "@/lib/audit";
import { normalizeSidebarPermissions } from "@/lib/sidebar-permissions";
import { validatePassword } from "@/lib/password-policy";
import { verifyStaffCredentials } from "@/lib/staff-credentials";

const BodySchema = z.object({
  login: z.string().trim().min(1).max(200),
  password: z.string().min(1).max(500),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, message: "Niepoprawne dane" }, { status: 400 });

  const { login, password } = parsed.data;

  const verified = await verifyStaffCredentials(login, password, "panel");
  if (verified.response) return verified.response;
  const { user } = verified;

  // Hasło tymczasowe (nadane przez administratora / bootstrap) albo niespełniające
  // obecnej polityki (np. dawne admin/admin) — nie wydajemy sesji, dopóki
  // pracownik nie ustawi nowego hasła (POST /api/auth/change-password).
  const policyIssue = validatePassword(password, { login: user.login, name: user.name, email: user.email });
  if (user.mustChangePassword || policyIssue) {
    await logAudit({
      actor: { type: "GUEST", name: user.name, contact: user.login },
      action: "LOGIN_FAILED",
      entity: "User",
      entityId: user.id,
      summary: `Logowanie wstrzymane do czasu zmiany hasła (konto „${user.login}")`,
      data: { reason: user.mustChangePassword ? "temporary_password" : "weak_password" },
    });
    return NextResponse.json(
      {
        ok: false,
        code: "PASSWORD_CHANGE_REQUIRED",
        message: user.mustChangePassword
          ? "To hasło jest tymczasowe. Ustaw własne hasło, aby się zalogować."
          : "Twoje hasło nie spełnia aktualnych wymagań bezpieczeństwa. Ustaw nowe hasło, aby się zalogować.",
      },
      { status: 403 },
    );
  }

  const token = await signAuthToken({
    id: user.id,
    email: user.email ?? `${user.login}@local`,
    name: user.name,
    role: user.role as any,
    sidebarPermissions: normalizeSidebarPermissions(user.role, user.sidebarPermissions),
  });

  await setAuthCookie(token);

  await logAudit({
    actorId: user.id,
    action: "LOGIN",
    entity: "User",
    entityId: user.id,
    summary: `Logowanie do panelu (konto „${user.login}")`,
  });

  return NextResponse.json({
    ok: true,
    user: {
      id: user.id,
      login: user.login,
      name: user.name,
      role: user.role,
      sidebarPermissions: normalizeSidebarPermissions(user.role, user.sidebarPermissions),
    },
  });
}
