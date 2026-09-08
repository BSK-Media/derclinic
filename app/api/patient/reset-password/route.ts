import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPasswordResetToken, setPatientAuthCookie, signPatientToken } from "@/lib/patient-auth";

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

const BodySchema = z.object({
  token: z.string().min(1),
  password: z.string().min(6, "Hasło musi mieć co najmniej 6 znaków").max(100),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return bad(parsed.error.issues[0]?.message ?? "Uzupełnij poprawnie wszystkie pola");

  const { token, password } = parsed.data;
  const tokenHash = hashPasswordResetToken(token);

  const patient = await prisma.patient.findFirst({
    where: { passwordResetTokenHash: tokenHash },
    select: { id: true, name: true, phone: true, email: true, passwordResetExpiresAt: true },
  });

  if (!patient || !patient.passwordResetExpiresAt || patient.passwordResetExpiresAt.getTime() < Date.now()) {
    return bad("Link do resetu hasła jest nieprawidłowy albo wygasł. Poproś o nowy.", 400);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.patient.update({
    where: { id: patient.id },
    data: { passwordHash, passwordResetTokenHash: null, passwordResetExpiresAt: null },
  });

  const authToken = await signPatientToken({
    id: patient.id,
    name: patient.name,
    phone: patient.phone,
    email: patient.email,
  });
  setPatientAuthCookie(authToken);

  return NextResponse.json({ ok: true });
}
