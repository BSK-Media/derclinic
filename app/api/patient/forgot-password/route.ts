import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { generatePasswordResetToken, PASSWORD_RESET_TOKEN_TTL_MS } from "@/lib/patient-auth";
import { sendEmail } from "@/lib/mailer";

const BodySchema = z.object({
  email: z.string().trim().min(1).email(),
});

// Zawsze zwracamy ten sam, ogólny komunikat sukcesu — niezależnie od tego,
// czy podany e-mail w ogóle ma konto w systemie. Inaczej formularz stałby
// się narzędziem do sprawdzania, czyj adres jest zarejestrowany (account
// enumeration).
const GENERIC_MESSAGE =
  "Jeśli na ten adres e-mail założone jest konto, wysłaliśmy na niego link do zresetowania hasła.";

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: "Podaj prawidłowy adres e-mail" }, { status: 400 });
  }
  const email = parsed.data.email.trim();

  const patient = await prisma.patient.findFirst({
    where: { email: { equals: email, mode: "insensitive" }, passwordHash: { not: null } },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, email: true },
  });

  if (patient?.email) {
    const { token, tokenHash } = generatePasswordResetToken();
    await prisma.patient.update({
      where: { id: patient.id },
      data: {
        passwordResetTokenHash: tokenHash,
        passwordResetExpiresAt: new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS),
      },
    });

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
    const resetUrl = `${baseUrl}/panel-klienta/reset-hasla?token=${token}`;
    const firstName = patient.name?.trim().split(/\s+/)[0] || "";

    await sendEmail({
      to: patient.email,
      subject: "Reset hasła — DerClinic",
      html: `
        <p>Cześć${firstName ? " " + firstName : ""},</p>
        <p>Otrzymaliśmy prośbę o zresetowanie hasła do panelu klienta DerClinic.</p>
        <p><a href="${resetUrl}">Kliknij tutaj, aby ustawić nowe hasło</a> (link ważny przez godzinę).</p>
        <p>Jeśli to nie Ty prosiłaś/eś o reset hasła, możesz zignorować tę wiadomość.</p>
      `,
      text: `Link do zresetowania hasła (ważny 1h): ${resetUrl}`,
    });
  }

  return NextResponse.json({ ok: true, message: GENERIC_MESSAGE });
}
