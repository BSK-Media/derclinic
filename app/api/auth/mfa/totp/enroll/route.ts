import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { challengedUser, completeMfaLogin, mfaChallengeExpired, regenerateRecoveryCodes } from "@/lib/mfa";
import { openSecret } from "@/lib/secret-box";
import { verifyTotp } from "@/lib/totp";
import {
  RATE_LIMITS,
  clientIp,
  failureDelay,
  hitRateLimit,
  peekRateLimit,
  tooManyRequests,
} from "@/lib/rate-limit";

const BodySchema = z.object({ code: z.string().trim().min(6).max(10) });

// Potwierdzenie konfiguracji MFA pierwszym kodem z aplikacji. Dopiero wtedy
// sekret staje się aktywny, powstają kody odzyskiwania i pełna sesja.
export async function POST(req: Request) {
  const user = await challengedUser("enroll");
  if (!user) return mfaChallengeExpired();
  if (!user.mfaTotpPendingSecretEnc) {
    return NextResponse.json({ ok: false, message: "Najpierw wygeneruj kod QR." }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, message: "Podaj 6-cyfrowy kod" }, { status: 400 });

  const ipLimit = await hitRateLimit(RATE_LIMITS.mfaIp, await clientIp());
  if (!ipLimit.allowed) return tooManyRequests(ipLimit);
  const accountLimit = await peekRateLimit(RATE_LIMITS.mfaAccount, user.id);
  if (!accountLimit.allowed) return tooManyRequests(accountLimit);

  const step = verifyTotp(openSecret(user.mfaTotpPendingSecretEnc), parsed.data.code);
  if (step === null) {
    const failures = await hitRateLimit(RATE_LIMITS.mfaAccount, user.id);
    await failureDelay(failures.count);
    return NextResponse.json(
      { ok: false, message: "Kod się nie zgadza. Sprawdź, czy zegar w telefonie jest ustawiony automatycznie." },
      { status: 400 },
    );
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      mfaTotpSecretEnc: user.mfaTotpPendingSecretEnc,
      mfaTotpPendingSecretEnc: null,
      mfaTotpLastStep: step,
      mfaEnabledAt: new Date(),
    },
  });
  const recoveryCodes = await regenerateRecoveryCodes(user.id);

  await logAudit({
    actorId: user.id,
    action: "MFA_ENROLL",
    entity: "User",
    entityId: user.id,
    summary: `Włączono logowanie dwuskładnikowe (aplikacja uwierzytelniająca) dla konta „${user.login}"`,
    data: { method: "TOTP", recoveryCodes: recoveryCodes.length },
  });
  await completeMfaLogin(user, "TOTP");

  return NextResponse.json({ ok: true, recoveryCodes }, { headers: { "Cache-Control": "no-store" } });
}
