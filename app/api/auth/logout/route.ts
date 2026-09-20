import { NextResponse } from "next/server";
import { clearAuthCookie, getAuthUser } from "@/lib/auth-cookie";
import { logAudit } from "@/lib/audit";

export async function POST() {
  // Kto się wylogowuje — odczytujemy z ciasteczka, zanim je wyczyścimy.
  const user = await getAuthUser();
  clearAuthCookie();
  if (user?.id) {
    await logAudit({
      actorId: user.id,
      action: "LOGOUT",
      entity: "User",
      entityId: user.id,
      summary: "Wylogowanie z panelu",
    });
  }
  return NextResponse.json({ ok: true });
}
