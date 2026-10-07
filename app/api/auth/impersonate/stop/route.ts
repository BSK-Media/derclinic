import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { stopImpersonation } from "@/lib/auth-cookie";

// Powrót na własne konto administratora. Sesja "jako" sama potwierdza, że jest
// sesją wejścia na cudze konto — nie sprawdzamy roli konta docelowego.
export async function POST() {
  const result = await stopImpersonation();
  if (!result) return NextResponse.json({ ok: false, message: "To nie jest sesja wejścia na konto" }, { status: 400 });

  const target = await prisma.user.findUnique({ where: { id: result.targetId }, select: { name: true, login: true } });
  await logAudit({
    actorId: result.adminId,
    action: "IMPERSONATE_END",
    entity: "User",
    entityId: result.targetId,
    summary: `Administrator opuścił konto „${target?.name ?? result.targetId}"${target ? ` (${target.login})` : ""}`,
  });

  return NextResponse.json({ ok: true, restored: result.restored });
}
