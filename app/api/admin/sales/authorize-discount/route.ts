import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

const BodySchema = z.object({
  login: z.string().min(1),
  password: z.string().min(1),
});

// Weryfikuje hasło administratora, aby zatwierdzić zniżkę w POS.
// Nie loguje wskazanego administratora — tylko potwierdza jego uprawnienia.
export async function POST(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireRole(user!.role, ["ADMIN", "RECEPTION"]);
  if (deny) return deny;

  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return bad("Podaj login i hasło administratora");

  const { login, password } = parsed.data;

  const admin = await prisma.user.findUnique({ where: { login } });
  if (!admin?.passwordHash || admin.role !== "ADMIN") {
    return bad("Błędny login lub hasło administratora", 401);
  }

  const ok = await bcrypt.compare(password, admin.passwordHash);
  if (!ok) return bad("Błędny login lub hasło administratora", 401);

  await logAudit({
    actorId: user!.id,
    action: "sale.discount_authorize",
    entity: "User",
    entityId: admin.id,
  });

  return NextResponse.json({ ok: true, admin: { id: admin.id, name: admin.name } });
}
