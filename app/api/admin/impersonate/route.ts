import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { requireStepUp } from "@/lib/mfa";
import { startImpersonation } from "@/lib/auth-cookie";

const BodySchema = z.object({ userId: z.string().min(1) });

// Administrator wchodzi na konto managera / recepcji / specjalisty bez przelogowania.
// Wymaga ponownego MFA administratora, a każde wejście trafia do dziennika zdarzeń.
export async function POST(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, message: "Niepoprawne dane" }, { status: 400 });

  const stepUp = requireStepUp(user!);
  if (stepUp) return stepUp;

  const target = await prisma.user.findUnique({
    where: { id: parsed.data.userId },
    select: { id: true, name: true, login: true, role: true },
  });
  if (!target) return NextResponse.json({ ok: false, message: "Nie znaleziono konta" }, { status: 404 });
  if (target.id === user!.id) {
    return NextResponse.json({ ok: false, message: "To jest Twoje konto" }, { status: 400 });
  }
  if (target.role === "ADMIN") {
    return NextResponse.json({ ok: false, message: "Nie można wejść na konto administratora" }, { status: 400 });
  }

  await startImpersonation(user!.id, target.id);
  await logAudit({
    actorId: user!.id,
    action: "IMPERSONATE_START",
    entity: "User",
    entityId: target.id,
    summary: `Administrator wszedł na konto „${target.name}" (${target.login})`,
    data: { targetId: target.id, targetRole: target.role },
  });

  return NextResponse.json({ ok: true });
}
