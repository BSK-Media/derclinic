import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { prisma } from "@/lib/db";
import { MFA_ISSUER_NAME, challengedUser, mfaChallengeExpired } from "@/lib/mfa";
import { sealSecret } from "@/lib/secret-box";
import { generateTotpSecret, otpauthUrl } from "@/lib/totp";

// Pierwszy krok konfiguracji MFA: nowy sekret TOTP (kod QR + klucz do wpisania
// ręcznie). Sekret zapisujemy zaszyfrowany jako "oczekujący" — aktywny staje
// się dopiero po potwierdzeniu pierwszym kodem (POST /api/auth/mfa/totp/enroll).
export async function POST() {
  const user = await challengedUser("enroll");
  if (!user) return mfaChallengeExpired();

  const secret = generateTotpSecret();
  await prisma.user.update({
    where: { id: user.id },
    data: { mfaTotpPendingSecretEnc: sealSecret(secret) },
  });

  const url = otpauthUrl({ secret, account: user.login, issuer: MFA_ISSUER_NAME });
  const qrSvg = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" });

  return NextResponse.json(
    { ok: true, secret: secret.replace(/(.{4})/g, "$1 ").trim(), otpauthUrl: url, qrSvg },
    { headers: { "Cache-Control": "no-store" } },
  );
}
