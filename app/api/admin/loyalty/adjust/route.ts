import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { requireStepUp } from "@/lib/mfa";

const BodySchema = z.object({
  patientId: z.string().min(1).max(100),
  direction: z.enum(["ADD", "SUBTRACT"]),
  points: z.number().int().min(1, "Podaj liczbę punktów (min. 1)").max(100_000, "Za duża liczba punktów"),
  note: z.string().trim().min(3, "Podaj powód (min. 3 znaki)").max(300),
});

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

// Ręczne dopisanie (albo skorygowanie) punktów klienta. Każda zmiana zapisuje
// się jako osobny wpis w historii punktów (widoczny też dla klienta) z
// powodem i autorem, a saldo zmienia się w tej samej transakcji.
export async function POST(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN", "MANAGER"]);
  if (deny) return deny;
  // Przyznawanie punktów (to realny rabat) = operacja wysokiego ryzyka: ponowne MFA.
  const stepUp = requireStepUp(user!);
  if (stepUp) return stepUp;

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad(parsed.error.issues[0]?.message ?? "Niepoprawne dane");
  const { patientId, direction, points, note } = parsed.data;

  const patient = await prisma.patient.findFirst({
    where: { id: patientId, ...(user!.locationScopeId ? { locationId: user!.locationScopeId } : {}) },
    select: { id: true, name: true, loyaltyPoints: true },
  });
  if (!patient) return bad("Nie znaleziono klienta", 404);

  const adding = direction === "ADD";
  const result = await prisma.$transaction(async (tx) => {
    if (!adding) {
      // Odejmujemy warunkowo, żeby dwa równoległe żądania nie zepchnęły salda poniżej zera.
      const updated = await tx.patient.updateMany({
        where: { id: patient.id, loyaltyPoints: { gte: points } },
        data: { loyaltyPoints: { decrement: points } },
      });
      if (updated.count === 0) return null;
    } else {
      await tx.patient.update({ where: { id: patient.id }, data: { loyaltyPoints: { increment: points } } });
    }
    await tx.loyaltyPointsTransaction.create({
      data: {
        patientId: patient.id,
        type: adding ? "EARNED" : "REDEEMED",
        points,
        note: `${adding ? "Dopisane ręcznie" : "Skorygowane ręcznie"} przez ${user!.name}: ${note}`,
      },
    });
    const fresh = await tx.patient.findUnique({ where: { id: patient.id }, select: { loyaltyPoints: true } });
    await logAudit({
      tx,
      actorId: user!.id,
      action: "UPDATE",
      entity: "LoyaltyPoints",
      entityId: patient.id,
      summary: `${adding ? "Dopisano" : "Odjęto"} ${points} pkt lojalnościowych klientowi ${patient.name} (powód: ${note}); saldo: ${fresh?.loyaltyPoints ?? "?"} pkt`,
      data: { patientId: patient.id, direction, points, note, balanceAfter: fresh?.loyaltyPoints ?? null },
    });
    return fresh?.loyaltyPoints ?? 0;
  });

  if (result === null) return bad(`Klient ma tylko ${patient.loyaltyPoints} pkt — nie można odjąć ${points}.`, 409);
  return NextResponse.json({ ok: true, balance: result });
}
