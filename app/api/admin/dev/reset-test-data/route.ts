import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { requireStepUp } from "@/lib/mfa";
import { RESET_TEST_DATA_PHRASE, countTestData, deleteTestData } from "@/lib/reset-test-data";

// TYMCZASOWE: jednorazowe czyszczenie danych testowych (patrz lib/reset-test-data.ts).

export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN"]);
  if (deny) return deny;
  return NextResponse.json({ ok: true, phrase: RESET_TEST_DATA_PHRASE, ...(await countTestData(prisma)) });
}

export async function POST(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN"]);
  if (deny) return deny;
  // Nieodwracalne usunięcie danych = operacja najwyższego ryzyka: ponowne MFA.
  const stepUp = requireStepUp(user!);
  if (stepUp) return stepUp;

  const body = await req.json().catch(() => null);
  if (body?.confirm !== RESET_TEST_DATA_PHRASE) {
    return NextResponse.json({ ok: false, message: "Wpisz dokładnie wymaganą frazę potwierdzenia." }, { status: 400 });
  }

  const before = await countTestData(prisma);
  try {
    // Jedna transakcja: albo wszystko, albo nic.
    await prisma.$transaction((tx) => deleteTestData(tx), { timeout: 120_000, maxWait: 30_000 });
  } catch (e) {
    console.error("[reset-test-data] błąd, transakcja wycofana", e);
    return NextResponse.json(
      { ok: false, message: "Nie udało się usunąć danych — nic nie zostało zmienione." },
      { status: 500 },
    );
  }

  await logAudit({
    actorId: user!.id,
    action: "DELETE",
    entity: "TestData",
    summary: "Jednorazowe usunięcie danych testowych (wizyty, pacjenci, produkty)",
    data: Object.fromEntries(before.toDelete.map((item) => [item.label, item.count])),
  });

  return NextResponse.json({ ok: true, after: await countTestData(prisma) });
}
