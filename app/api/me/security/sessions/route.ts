import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-cookie";
import { logAudit } from "@/lib/audit";
import { revokeAllStaffSessions } from "@/lib/session-core";

// "Wyloguj pozostałe urządzenia" — unieważnia wszystkie sesje poza bieżącą.
export async function DELETE() {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ ok: false }, { status: 401 });
  const count = await revokeAllStaffSessions(auth.id, "user_revoked_others", auth.sessionId);
  await logAudit({
    actorId: auth.id,
    action: "SESSION_REVOKE",
    entity: "User",
    entityId: auth.id,
    summary: `Wylogowanie z pozostałych urządzeń (${count} sesji)`,
    data: { count },
  });
  return NextResponse.json({ ok: true, revoked: count });
}
