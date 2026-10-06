import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { requireStepUp } from "@/lib/mfa";
import { STAFF_BCRYPT_COST } from "@/lib/staff-credentials";
import { validateOperatorPin } from "@/lib/operator-pin";
import { pinTakenOnAccount } from "@/lib/operators";

const PatchSchema = z.object({
  name: z.string().trim().min(2, "Podaj imię i nazwisko (min. 2 znaki)").max(60).optional(),
  pin: z.string().optional(),
});

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

async function loadOperator(accountId: string, operatorId: string) {
  return prisma.staffOperator.findFirst({
    where: { id: operatorId, userId: accountId },
    select: { id: true, name: true, user: { select: { login: true } } },
  });
}

// Zmiana imienia i/lub PIN-u osoby na koncie wspólnym.
export async function PATCH(req: Request, props: { params: Promise<{ id: string; opId: string }> }) {
  const params = await props.params;
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN"]);
  if (deny) return deny;
  const stepUp = requireStepUp(user!);
  if (stepUp) return stepUp;

  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad(parsed.error.issues[0]?.message ?? "Niepoprawne dane");
  if (parsed.data.name === undefined && parsed.data.pin === undefined) return bad("Brak zmian");

  const operator = await loadOperator(params.id, params.opId);
  if (!operator) return bad("Nie znaleziono osoby", 404);

  const data: { name?: string; pinHash?: string } = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.pin !== undefined) {
    const pinIssue = validateOperatorPin(parsed.data.pin);
    if (pinIssue) return bad(pinIssue);
    if (await pinTakenOnAccount(params.id, parsed.data.pin, operator.id)) {
      return bad("Ten PIN jest już użyty przez inną osobę na tym koncie — wybierz inny.", 409);
    }
    data.pinHash = await bcrypt.hash(parsed.data.pin, STAFF_BCRYPT_COST);
  }

  const updated = await prisma.staffOperator.update({
    where: { id: operator.id },
    data,
    select: { id: true, name: true, createdAt: true, updatedAt: true },
  });

  await logAudit({
    actorId: user!.id,
    action: "UPDATE",
    entity: "StaffOperator",
    entityId: operator.id,
    summary: `Zmiana osoby na koncie wspólnym „${operator.user.login}": ${operator.name}${
      data.name ? ` → ${data.name}` : ""
    }${data.pinHash ? " (nowy PIN)" : ""}`,
    data: { accountId: params.id, nameChanged: Boolean(data.name), pinChanged: Boolean(data.pinHash) },
  });

  return NextResponse.json({ ok: true, operator: updated });
}

export async function DELETE(_req: Request, props: { params: Promise<{ id: string; opId: string }> }) {
  const params = await props.params;
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN"]);
  if (deny) return deny;
  const stepUp = requireStepUp(user!);
  if (stepUp) return stepUp;

  const operator = await loadOperator(params.id, params.opId);
  if (!operator) return bad("Nie znaleziono osoby", 404);

  // Sesje tej osoby wracają do stanu "czeka na PIN" (onDelete: SetNull);
  // gdy była ostatnia, konto przestaje być wspólne.
  await prisma.staffOperator.delete({ where: { id: operator.id } });

  await logAudit({
    actorId: user!.id,
    action: "DELETE",
    entity: "StaffOperator",
    entityId: operator.id,
    summary: `Usunięto osobę „${operator.name}" z konta wspólnego „${operator.user.login}"`,
    data: { accountId: params.id, operatorName: operator.name },
  });

  return NextResponse.json({ ok: true });
}
