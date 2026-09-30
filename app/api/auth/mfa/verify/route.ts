import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { challengedUser, completeMfaLogin, mfaChallengeExpired, verifySecondFactor } from "@/lib/mfa";

const BodySchema = z
  .object({
    code: z.string().trim().max(10).optional(),
    recoveryCode: z.string().trim().max(30).optional(),
  })
  .refine((v) => Boolean(v.code) !== Boolean(v.recoveryCode), "Podaj kod z aplikacji albo kod odzyskiwania");

// Drugi krok logowania: kod TOTP albo jednorazowy kod odzyskiwania.
export async function POST(req: Request) {
  const user = await challengedUser("verify");
  if (!user) return mfaChallengeExpired();

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: parsed.error.issues[0]?.message ?? "Podaj kod" }, { status: 400 });
  }

  const result = await verifySecondFactor(user, parsed.data, "logowanie");
  if (!result.ok) return result.response;

  await completeMfaLogin(user, result.method);
  const recoveryCodesRemaining = await prisma.mfaRecoveryCode.count({ where: { userId: user.id, usedAt: null } });
  return NextResponse.json({ ok: true, recoveryCodesRemaining });
}
