import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { setAuthCookie, signAuthToken } from "@/lib/auth-cookie";
import { logAudit } from "@/lib/audit";

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
  if (!user?.passwordHash) return NextResponse.json({ ok: false, message: "Błędny login lub hasło" }, { status: 401 });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return NextResponse.json({ ok: false, message: "Błędny login lub hasło" }, { status: 401 });

  const token = await signAuthToken({
    id: user.id,
    email: user.email ?? `${user.login}@local`,
    name: user.name,
    role: user.role as any,
  });

  setAuthCookie(token);

  await logAudit({ actorId: user.id, action: "LOGIN", entity: "User", entityId: user.id });

  return NextResponse.json({ ok: true, user: { id: user.id, login: user.login, name: user.name, role: user.role } });
}
