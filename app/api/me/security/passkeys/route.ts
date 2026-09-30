import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getAuthUser } from "@/lib/auth-cookie";
import { logAudit } from "@/lib/audit";
import { requireStepUp } from "@/lib/mfa";
import { verifyPasskeyRegistration } from "@/lib/webauthn";

const AddSchema = z.object({ name: z.string().trim().max(60).optional(), response: z.any() });

// Zapis nowego klucza dostępu po odpowiedzi urządzenia.
export async function POST(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ ok: false }, { status: 401 });
  const stepUp = requireStepUp(auth);
  if (stepUp) return stepUp;

  const parsed = AddSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !parsed.data.response) {
    return NextResponse.json({ ok: false, message: "Niepoprawne dane" }, { status: 400 });
  }
  const passkey = await verifyPasskeyRegistration(auth.id, parsed.data.response, parsed.data.name || "Klucz dostępu");
  if (!passkey) return NextResponse.json({ ok: false, message: "Nie udało się dodać klucza dostępu" }, { status: 400 });

  await logAudit({
    actorId: auth.id,
    action: "MFA_METHOD_CHANGE",
    entity: "User",
    entityId: auth.id,
    summary: `Dodano klucz dostępu (passkey) „${passkey.name}"`,
    data: { method: "PASSKEY", change: "added" },
  });
  return NextResponse.json({ ok: true, passkey });
}

// Usunięcie klucza dostępu. TOTP zostaje, więc konto nie traci drugiego składnika.
export async function DELETE(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ ok: false }, { status: 401 });
  const stepUp = requireStepUp(auth);
  if (stepUp) return stepUp;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, message: "Brak identyfikatora" }, { status: 400 });
  const passkey = await prisma.webAuthnPasskey.findFirst({
    where: { id, userId: auth.id },
    select: { id: true, name: true },
  });
  if (!passkey) return NextResponse.json({ ok: false, message: "Nie znaleziono klucza" }, { status: 404 });
  await prisma.webAuthnPasskey.delete({ where: { id: passkey.id } });

  await logAudit({
    actorId: auth.id,
    action: "MFA_METHOD_CHANGE",
    entity: "User",
    entityId: auth.id,
    summary: `Usunięto klucz dostępu (passkey) „${passkey.name}"`,
    data: { method: "PASSKEY", change: "removed" },
  });
  return NextResponse.json({ ok: true });
}
