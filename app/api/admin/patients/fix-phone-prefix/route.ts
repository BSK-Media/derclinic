import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";

// Naprawa danych po błędzie w /api/patient/register, który do numeru telefonu
// zwalidowanego już jako "+48" + 9 cyfr doklejał drugi prefiks "+48"
// (np. "+48660027421" -> "+4848660027421"), uniemożliwiając późniejsze
// logowanie tym numerem. Bezpieczne do wielokrotnego uruchomienia — po
// naprawieniu numerów nie ma już nic do zrobienia. Wzorzec "+4848" + 9 cyfr
// (13 cyfr po "+") nigdy nie powstaje z prawidłowego numeru (ten ma zawsze
// dokładnie 11 cyfr po "+"), więc naprawa jest jednoznaczna.
const DOUBLE_PREFIX = /^\+4848(\d{9})$/;

export async function POST() {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const candidates = await prisma.patient.findMany({
    where: { phone: { startsWith: "+4848" } },
    select: { id: true, phone: true },
  });

  let fixed = 0;
  for (const patient of candidates) {
    const match = patient.phone?.match(DOUBLE_PREFIX);
    if (!match) continue;
    await prisma.patient.update({
      where: { id: patient.id },
      data: { phone: `+48${match[1]}` },
    });
    fixed++;
  }

  if (fixed > 0) {
    await logAudit({
      actorId: user!.id,
      action: "UPDATE",
      entity: "PatientPhoneFix",
      entityId: "bulk",
      data: { candidatesScanned: candidates.length, fixed },
    });
  }

  return NextResponse.json({ ok: true, candidatesScanned: candidates.length, fixed });
}
