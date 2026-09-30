import { NextResponse } from "next/server";
import { endStaffSession } from "@/lib/auth-cookie";
import { logAudit } from "@/lib/audit";

export async function POST() {
  // Unieważniamy sesję w bazie (a nie tylko czyścimy ciasteczko) — skopiowany
  // token przestaje działać natychmiast.
  const user = await endStaffSession("logout");
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
