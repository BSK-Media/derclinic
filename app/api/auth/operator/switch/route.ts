import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getStaffSession } from "@/lib/auth-cookie";
import { logAudit } from "@/lib/audit";

// „Zmień osobę": na koncie wspólnym zdejmuje wybraną osobę z sesji, więc
// następna osoba musi podać swój PIN. Hasło i MFA nie są ponownie wymagane.
export async function POST() {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ ok: false, message: "Zaloguj się ponownie." }, { status: 401 });
  if (!session.operatorId) return NextResponse.json({ ok: true });

  const previousName = session.operator?.name ?? null;
  // Wpis do dziennika jeszcze jako dotychczasowa osoba.
  await logAudit({
    actorId: session.userId,
    action: "LOGOUT",
    entity: "User",
    entityId: session.userId,
    summary: `Przy koncie wspólnym „${session.user.login}" kończy pracę: ${previousName ?? "—"} (zmiana osoby)`,
  });
  await prisma.staffSession.update({ where: { id: session.id }, data: { operatorId: null } });
  return NextResponse.json({ ok: true });
}
