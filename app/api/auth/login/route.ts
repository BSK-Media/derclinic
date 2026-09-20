import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { setAuthCookie, signAuthToken } from "@/lib/auth-cookie";
import { logAudit } from "@/lib/audit";
import { normalizeSidebarPermissions } from "@/lib/sidebar-permissions";

const BodySchema = z.object({
  login: z.string().min(1),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, message: "Niepoprawne dane" }, { status: 400 });

  const { login, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { login } });
  if (!user?.passwordHash) {
    await logAudit({
      actor: { type: "GUEST", contact: login },
      action: "LOGIN_FAILED",
      entity: "User",
      summary: `Nieudane logowanie do panelu: nieznany login „${login}"`,
      data: { login, reason: "unknown_login" },
    });
    return NextResponse.json({ ok: false, message: "Błędny login lub hasło" }, { status: 401 });
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    await logAudit({
      actor: { type: "GUEST", name: user.name, contact: login },
      action: "LOGIN_FAILED",
      entity: "User",
      entityId: user.id,
      summary: `Nieudane logowanie do panelu: błędne hasło dla konta „${login}" (${user.name})`,
      data: { login, reason: "wrong_password" },
    });
    return NextResponse.json({ ok: false, message: "Błędny login lub hasło" }, { status: 401 });
  }

  const token = await signAuthToken({
    id: user.id,
    email: user.email ?? `${user.login}@local`,
    name: user.name,
    role: user.role as any,
    sidebarPermissions: normalizeSidebarPermissions(user.role, user.sidebarPermissions),
  });

  setAuthCookie(token);

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
