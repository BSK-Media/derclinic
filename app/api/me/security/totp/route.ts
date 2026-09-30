import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getAuthUser } from "@/lib/auth-cookie";
import { logAudit } from "@/lib/audit";
import { MFA_ISSUER_NAME, requireStepUp } from "@/lib/mfa";
import { openSecret, sealSecret } from "@/lib/secret-box";
import { generateTotpSecret, otpauthUrl, verifyTotp } from "@/lib/totp";
import { RATE_LIMITS, hitRateLimit, peekRateLimit, tooManyRequests } from "@/lib/rate-limit";

const BodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("setup") }),
  z.object({ action: z.literal("confirm"), code: z.string().trim().min(6).max(10) }),
]);

// Przeniesienie MFA na nową aplikację/telefon. Stary sekret działa aż do
// potwierdzenia nowego kodem — nie da się przy tym zostać bez drugiego składnika.
export async function POST(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ ok: false }, { status: 401 });
  const stepUp = requireStepUp(auth);
  if (stepUp) return stepUp;

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, message: "Niepoprawne dane" }, { status: 400 });

  const user = await prisma.user.findUniqueOrThrow({ where: { id: auth.id } });

  if (parsed.data.action === "setup") {
    const secret = generateTotpSecret();
    await prisma.user.update({ where: { id: user.id }, data: { mfaTotpPendingSecretEnc: sealSecret(secret) } });
    const url = otpauthUrl({ secret, account: user.login, issuer: MFA_ISSUER_NAME });
    return NextResponse.json(
      {
        ok: true,
        secret: secret.replace(/(.{4})/g, "$1 ").trim(),
        otpauthUrl: url,
        qrSvg: await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" }),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  if (!user.mfaTotpPendingSecretEnc) {
    return NextResponse.json({ ok: false, message: "Najpierw wygeneruj nowy kod QR." }, { status: 400 });
  }
  const limit = await peekRateLimit(RATE_LIMITS.mfaAccount, user.id);
  if (!limit.allowed) return tooManyRequests(limit);
  const step = verifyTotp(openSecret(user.mfaTotpPendingSecretEnc), parsed.data.code);
  if (step === null) {
    await hitRateLimit(RATE_LIMITS.mfaAccount, user.id);
    return NextResponse.json({ ok: false, message: "Kod się nie zgadza" }, { status: 400 });
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { mfaTotpSecretEnc: user.mfaTotpPendingSecretEnc, mfaTotpPendingSecretEnc: null, mfaTotpLastStep: step },
  });
  await logAudit({
    actorId: user.id,
    action: "MFA_METHOD_CHANGE",
    entity: "User",
    entityId: user.id,
    summary: "Przeniesiono logowanie dwuskładnikowe na nową aplikację uwierzytelniającą",
    data: { method: "TOTP" },
  });
  return NextResponse.json({ ok: true });
}
