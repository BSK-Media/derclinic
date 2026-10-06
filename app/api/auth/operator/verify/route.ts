import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getStaffSession } from "@/lib/auth-cookie";
import { logAudit } from "@/lib/audit";
import { revokeAllStaffSessions } from "@/lib/session-core";
import { firstAllowedSidebarHref, normalizeSidebarPermissions } from "@/lib/sidebar-permissions";
import { RATE_LIMITS, clientIp, hitRateLimit, resetRateLimit, tooManyRequests } from "@/lib/rate-limit";

const BodySchema = z.object({ pin: z.string().regex(/^\d{6}$/, "PIN to 6 cyfr") });

// Drugi krok logowania na koncie wspólnym (recepcja): po haśle i MFA sesja czeka
// na PIN. Podany PIN wskazuje osobę przy komputerze — jej imię trafia do
// dziennika zdarzeń przy każdej akcji z tej sesji.
export async function POST(req: Request) {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ ok: false, message: "Zaloguj się ponownie." }, { status: 401 });
  if (!session.operatorPending) return NextResponse.json({ ok: true, redirect: "/admin" });

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: parsed.error.issues[0]?.message ?? "Podaj PIN" }, { status: 400 });
  }

  const ipLimit = await hitRateLimit(RATE_LIMITS.operatorPinIp, await clientIp());
  if (!ipLimit.allowed) return tooManyRequests(ipLimit);

  const operators = await prisma.staffOperator.findMany({
    where: { userId: session.userId },
    select: { id: true, name: true, pinHash: true },
  });

  let matched: { id: string; name: string } | null = null;
  for (const operator of operators) {
    if (await bcrypt.compare(parsed.data.pin, operator.pinHash)) matched = { id: operator.id, name: operator.name };
  }

  if (!matched) {
    const failures = await hitRateLimit(RATE_LIMITS.operatorPinAccount, session.userId);
    await logAudit({
      actorId: session.userId,
      action: "LOGIN_FAILED",
      entity: "User",
      entityId: session.userId,
      summary: `Błędny PIN osoby na koncie wspólnym „${session.user.login}"`,
      data: { reason: "wrong_operator_pin" },
    });
    // Za dużo błędnych PIN-ów: kończymy sesję — trzeba zalogować się od nowa hasłem i MFA.
    if (!failures.allowed) {
      await revokeAllStaffSessions(session.userId, "operator_pin_lockout");
      return NextResponse.json(
        { ok: false, locked: true, message: "Zbyt wiele błędnych PIN-ów. Zaloguj się ponownie." },
        { status: 429 },
      );
    }
    return NextResponse.json({ ok: false, message: "Błędny PIN" }, { status: 401 });
  }

  await resetRateLimit(RATE_LIMITS.operatorPinAccount, session.userId);
  await prisma.staffSession.update({ where: { id: session.id }, data: { operatorId: matched.id } });
  await logAudit({
    actorId: session.userId,
    action: "LOGIN",
    entity: "User",
    entityId: session.userId,
    summary: `Przy koncie wspólnym „${session.user.login}" pracuje teraz: ${matched.name}`,
    data: { operatorId: matched.id, operatorName: matched.name },
  });

  const redirect = firstAllowedSidebarHref(
    session.user.role,
    normalizeSidebarPermissions(session.user.role, session.user.sidebarPermissions),
  );
  return NextResponse.json({ ok: true, operatorName: matched.name, redirect });
}
