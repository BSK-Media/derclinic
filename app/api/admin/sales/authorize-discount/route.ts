import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { RATE_LIMITS, failureDelay, hitRateLimit, peekRateLimit, resetRateLimit, tooManyRequests } from "@/lib/rate-limit";

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

const BodySchema = z.object({
  login: z.string().trim().min(1).max(200),
  password: z.string().min(1).max(500),
});

// Weryfikuje hasło administratora, aby zatwierdzić zniżkę w POS.
// Nie loguje wskazanego administratora — tylko potwierdza jego uprawnienia.
export async function POST(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = await requireRole(user!.role, ["ADMIN", "RECEPTION"]);
  if (deny) return deny;

  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return bad("Podaj login i hasło administratora");

  const { login, password } = parsed.data;

  // Ten sam licznik błędnych prób co przy logowaniu administratora — formularz
  // rabatu nie może służyć do zgadywania jego hasła (audyt F-05).
  const limit = await peekRateLimit(RATE_LIMITS.staffLoginAccount, login);
  if (!limit.allowed) return tooManyRequests(limit, "Zbyt wiele błędnych prób. Spróbuj ponownie później.");

  const admin = await prisma.user.findUnique({ where: { login } });
  if (!admin?.passwordHash || admin.role !== "ADMIN") {
    await logAudit({
      actorId: user!.id,
      action: "LOGIN_FAILED",
      entity: "User",
      summary: `Nieudana autoryzacja rabatu w POS: „${login}" nie jest kontem administratora`,
      data: { attemptedLogin: login, reason: "not_admin_or_unknown" },
    });
    await failureDelay((await hitRateLimit(RATE_LIMITS.staffLoginAccount, login)).count);
    return bad("Błędny login lub hasło administratora", 401);
  }

  const ok = await bcrypt.compare(password, admin.passwordHash);
  if (!ok) {
    await logAudit({
      actorId: user!.id,
      action: "LOGIN_FAILED",
      entity: "User",
      entityId: admin.id,
      summary: `Nieudana autoryzacja rabatu w POS: błędne hasło administratora „${login}"`,
      data: { attemptedLogin: login, reason: "wrong_password" },
    });
    await failureDelay((await hitRateLimit(RATE_LIMITS.staffLoginAccount, login)).count);
    return bad("Błędny login lub hasło administratora", 401);
  }

  await resetRateLimit(RATE_LIMITS.staffLoginAccount, login);
  await logAudit({
    actorId: user!.id,
    action: "sale.discount_authorize",
    entity: "User",
    entityId: admin.id,
    summary: `Autoryzacja rabatu w POS przez administratora „${admin.name}"`,
    data: { authorizedByAdminId: admin.id },
  });

  return NextResponse.json({ ok: true, admin: { id: admin.id, name: admin.name } });
}
