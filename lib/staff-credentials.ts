import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import {
  RATE_LIMITS,
  clientIp,
  failureDelay,
  hitRateLimit,
  peekRateLimit,
  resetRateLimit,
  tooManyRequests,
} from "@/lib/rate-limit";

// Hash losowego ciągu — porównujemy z nim hasło, gdy login nie istnieje, żeby
// czas odpowiedzi nie zdradzał, czy konto jest w systemie.
const DUMMY_HASH = "$2a$10$/NEPJVneyvWB1YSAn..YueZNEeW93B6gbmm82Pg/4iLzAwzWIU6Fe";

export const STAFF_BCRYPT_COST = 12;

/**
 * Weryfikuje login i hasło pracownika wraz z limitami prób (per IP i per konto).
 * Zwraca konto albo gotową odpowiedź błędu (401/429), którą trzeba odesłać.
 */
export async function verifyStaffCredentials(
  login: string,
  password: string,
  context: string,
): Promise<{ user: User; response?: undefined } | { user?: undefined; response: NextResponse }> {
  const ip = await clientIp();
  const ipLimit = await hitRateLimit(RATE_LIMITS.staffLoginIp, ip);
  if (!ipLimit.allowed) return { response: tooManyRequests(ipLimit) };

  const accountLimit = await peekRateLimit(RATE_LIMITS.staffLoginAccount, login);
  if (!accountLimit.allowed) {
    return {
      response: tooManyRequests(
        accountLimit,
        `Zbyt wiele nieudanych prób logowania na to konto. Spróbuj ponownie za ${Math.ceil(
          accountLimit.retryAfterSec / 60,
        )} min.`,
      ),
    };
  }

  const user = await prisma.user.findUnique({ where: { login } });
  const ok = await bcrypt.compare(password, user?.passwordHash || DUMMY_HASH);

  if (!user || !ok) {
    const failures = await hitRateLimit(RATE_LIMITS.staffLoginAccount, login);
    await logAudit({
      actor: { type: "GUEST", name: user?.name ?? null, contact: login },
      action: "LOGIN_FAILED",
      entity: "User",
      entityId: user?.id ?? null,
      summary: user
        ? `Nieudane logowanie (${context}): błędne hasło dla konta „${login}" (${user.name})`
        : `Nieudane logowanie (${context}): nieznany login „${login}"`,
      data: { login, reason: user ? "wrong_password" : "unknown_login", failures: failures.count },
    });
    await failureDelay(failures.count);
    return {
      response: NextResponse.json({ ok: false, message: "Błędny login lub hasło" }, { status: 401 }),
    };
  }

  await resetRateLimit(RATE_LIMITS.staffLoginAccount, login);
  return { user };
}
