import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { challengedUser, completeMfaLogin, mfaChallengeExpired } from "@/lib/mfa";
import { RATE_LIMITS, clientIp, hitRateLimit, peekRateLimit, resetRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { verifyPasskeyAuthentication } from "@/lib/webauthn";

export async function POST(req: Request) {
  const user = await challengedUser("verify");
  if (!user) return mfaChallengeExpired();

  const ipLimit = await hitRateLimit(RATE_LIMITS.mfaIp, await clientIp());
  if (!ipLimit.allowed) return tooManyRequests(ipLimit);
  const accountLimit = await peekRateLimit(RATE_LIMITS.mfaAccount, user.id);
  if (!accountLimit.allowed) return tooManyRequests(accountLimit);

  const body = await req.json().catch(() => null);
  const ok = body?.response ? await verifyPasskeyAuthentication(user.id, body.response) : false;
  if (!ok) {
    await hitRateLimit(RATE_LIMITS.mfaAccount, user.id);
    await logAudit({
      actor: { type: "GUEST", name: user.name, contact: user.login },
      action: "MFA_FAILED",
      entity: "User",
      entityId: user.id,
      summary: `Nieudane logowanie kluczem dostępu dla konta „${user.login}"`,
      data: { kind: "passkey" },
    });
    return NextResponse.json({ ok: false, message: "Nie udało się potwierdzić klucza dostępu" }, { status: 401 });
  }

  await resetRateLimit(RATE_LIMITS.mfaAccount, user.id);
  await completeMfaLogin(user, "PASSKEY");
  return NextResponse.json({ ok: true });
}
