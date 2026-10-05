import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { generatePasswordResetToken, PASSWORD_RESET_TOKEN_TTL_MS } from "@/lib/patient-auth";
import { appBaseUrl, sendTrackedEmail } from "@/lib/email-notifications";
import { staffPasswordResetEmail } from "@/lib/email-templates";
import { logAudit } from "@/lib/audit";
import { RATE_LIMITS, clientIp, hitRateLimit, tooManyRequests } from "@/lib/rate-limit";

const BodySchema = z.object({
  // Login albo adres e-mail przypisany do konta.
  identifier: z.string().trim().min(1).max(200),
});

// Zawsze ta sama odpowiedź — niezależnie od tego, czy konto istnieje i czy ma
// adres e-mail. Inaczej formularz zdradzałby loginy pracowników.
const GENERIC_MESSAGE =
  "Jeśli takie konto istnieje i ma przypisany adres e-mail, wysłaliśmy na niego link do ustawienia nowego hasła. Jeśli wiadomość nie dojdzie, poproś administratora o reset hasła.";

// "Nie pamiętam hasła" na ekranie logowania personelu. Link z e-maila pozwala
// ustawić nowe hasło, ale NIE omija logowania dwuskładnikowego — po zmianie
// pracownik loguje się normalnie i podaje kod z aplikacji.
export async function POST(req: Request) {
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: "Podaj login albo adres e-mail" }, { status: 400 });
  }
  const identifier = parsed.data.identifier;

  const ipLimit = await hitRateLimit(RATE_LIMITS.forgotPasswordIp, await clientIp());
  if (!ipLimit.allowed) return tooManyRequests(ipLimit);
  const accountLimit = await hitRateLimit(RATE_LIMITS.forgotPasswordAccount, `staff:${identifier.toLowerCase()}`);
  if (!accountLimit.allowed) return NextResponse.json({ ok: true, message: GENERIC_MESSAGE });

  const user = await prisma.user.findFirst({
    where: {
      OR: [{ login: identifier }, { email: { equals: identifier, mode: "insensitive" } }],
    },
    select: { id: true, login: true, name: true, email: true },
  });

  if (user?.email) {
    const { token, tokenHash } = generatePasswordResetToken();
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetTokenHash: tokenHash,
        passwordResetExpiresAt: new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS),
      },
    });
    await sendTrackedEmail({
      ...staffPasswordResetEmail({
        name: user.name,
        login: user.login,
        resetUrl: `${appBaseUrl(req)}/login/reset-hasla?token=${token}`,
      }),
      type: "PASSWORD_RESET",
      to: user.email,
    });
  }

  await logAudit({
    actor: { type: "GUEST", name: user?.name ?? null, contact: identifier },
    action: "PASSWORD_RESET_REQUEST",
    entity: "User",
    entityId: user?.id ?? null,
    summary: !user
      ? `Prośba o reset hasła personelu dla „${identifier}" — brak konta, nic nie wysłano`
      : user.email
        ? `Prośba o reset hasła konta „${user.login}" (${user.name}) — wysłano link`
        : `Prośba o reset hasła konta „${user.login}" (${user.name}) — konto bez adresu e-mail, nic nie wysłano`,
    data: { accountFound: Boolean(user), hasEmail: Boolean(user?.email) },
  });

  return NextResponse.json({ ok: true, message: GENERIC_MESSAGE });
}
