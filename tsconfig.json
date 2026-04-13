import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";

export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const users = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: { id: true, login: true, name: true, role: true, email: true, payoutPercent: true, createdAt: true },
  });
  return NextResponse.json({ ok: true, users });
}

const CreateSchema = z.object({
  login: z.string().min(2),
  name: z.string().min(2),
  role: z.enum(["ADMIN", "RECEPTION", "SPECIALIST"]),
  email: z.string().email().optional().or(z.literal("")),
  password: z.string().min(4),
  payoutPercent: z.number().int().min(0).max(100).optional(),
});

export async function POST(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const json = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, message: "Niepoprawne dane" }, { status: 400 });

  const { login, name, role, email, password, payoutPercent } = parsed.data;

  const passwordHash = await bcrypt.hash(password, 10);

  const created = await prisma.user.create({
    data: {
      login,
      name,
      role: role as any,
      email: email ? email : null,
      passwordHash,
      payoutPercent: role === "SPECIALIST" ? (payoutPercent ?? 50) : 0,
    },
    select: { id: true, login: true, name: true, role: true, email: true, payoutPercent: true },
  });

  await logAudit({ actorId: user!.id, action: "CREATE", entity: "User", entityId: created.id, data: { login, role } });

  return NextResponse.json({ ok: true, user: created });
}
