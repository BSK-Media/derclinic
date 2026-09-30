import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-cookie";
import { logAudit } from "@/lib/audit";
import { regenerateRecoveryCodes, requireStepUp } from "@/lib/mfa";

// Nowy komplet kodów odzyskiwania (poprzednie przestają działać).
export async function POST() {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ ok: false }, { status: 401 });
  const stepUp = requireStepUp(auth);
  if (stepUp) return stepUp;

  const recoveryCodes = await regenerateRecoveryCodes(auth.id);
  await logAudit({
    actorId: auth.id,
    action: "MFA_RECOVERY_REGENERATED",
    entity: "User",
    entityId: auth.id,
    summary: "Wygenerowano nowy komplet kodów odzyskiwania (poprzednie unieważnione)",
  });
  return NextResponse.json({ ok: true, recoveryCodes }, { headers: { "Cache-Control": "no-store" } });
}
