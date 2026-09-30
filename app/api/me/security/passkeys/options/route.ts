import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthUser } from "@/lib/auth-cookie";
import { requireStepUp } from "@/lib/mfa";
import { passkeyRegistrationOptions } from "@/lib/webauthn";

// Wyzwanie do dodania nowego klucza dostępu (passkey) do własnego konta.
export async function POST() {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ ok: false }, { status: 401 });
  const stepUp = requireStepUp(auth);
  if (stepUp) return stepUp;
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: auth.id },
    select: { id: true, login: true, name: true },
  });
  const options = await passkeyRegistrationOptions(user);
  return NextResponse.json({ ok: true, options }, { headers: { "Cache-Control": "no-store" } });
}
