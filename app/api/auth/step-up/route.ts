import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getAuthUser } from "@/lib/auth-cookie";
import { logAudit } from "@/lib/audit";
import { MFA_METHOD_LABELS, verifySecondFactor } from "@/lib/mfa";
import { RATE_LIMITS, hitRateLimit, peekRateLimit, resetRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { verifyPasskeyAuthentication } from "@/lib/webauthn";

const BodySchema = z.object({
  code: z.string().trim().max(10).optional(),
  recoveryCode: z.string().trim().max(30).optional(),
  passkeyResponse: z.any().optional(),
});

// Ponowne potwierdzenie MFA w trakcie trwającej sesji (step-up) — wymagane
// przed operacjami wysokiego ryzyka (zmiana ról, reset MFA, eksport danych…).
export async function POST(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ ok: false, message: "Brak autoryzacji" }, { status: 401 });

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, message: "Niepoprawne dane" }, { status: 400 });

  const user = await prisma.user.findUniqueOrThrow({ where: { id: auth.id } });
  let method: string;

  if (parsed.data.passkeyResponse) {
    const limit = await peekRateLimit(RATE_LIMITS.mfaAccount, user.id);
    if (!limit.allowed) return tooManyRequests(limit);
    if (!(await verifyPasskeyAuthentication(user.id, parsed.data.passkeyResponse))) {
      await hitRateLimit(RATE_LIMITS.mfaAccount, user.id);
      return NextResponse.json({ ok: false, message: "Nie udało się potwierdzić klucza dostępu" }, { status: 401 });
    }
    await resetRateLimit(RATE_LIMITS.mfaAccount, user.id);
    method = "PASSKEY";
  } else {
    const result = await verifySecondFactor(user, parsed.data, "potwierdzenie operacji");
    if (!result.ok) return result.response;
    method = result.method;
  }

  await prisma.staffSession.update({ where: { id: auth.sessionId }, data: { stepUpAt: new Date() } });
  await logAudit({
    actorId: user.id,
    action: "MFA_STEP_UP",
    entity: "User",
    entityId: user.id,
    summary: `Ponowne potwierdzenie tożsamości przed operacją wysokiego ryzyka (${MFA_METHOD_LABELS[method]})`,
    data: { method },
  });
  return NextResponse.json({ ok: true });
}
