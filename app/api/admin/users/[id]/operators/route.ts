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

const CreateSchema = z.object({
  name: z.string().trim().min(2, "Podaj imię i nazwisko (min. 2 znaki)").max(60),
  pin: z.string(),
});

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

// Osoby pracujące na wspólnym koncie recepcji i ich PIN-y — tylko administrator.
// PIN-u nie da się odczytać (przechowujemy hash) — można go tylko ustawić na nowo.
export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const operators = await prisma.staffOperator.findMany({
    where: { userId: params.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, createdAt: true, updatedAt: true },
  });
  return NextResponse.json({ ok: true, operators });
}

export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN"]);
  if (deny) return deny;
  const stepUp = requireStepUp(user!);
  if (stepUp) return stepUp;

  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad(parsed.error.issues[0]?.message ?? "Niepoprawne dane");
  const pinIssue = validateOperatorPin(parsed.data.pin);
  if (pinIssue) return bad(pinIssue);

  const account = await prisma.user.findUnique({ where: { id: params.id }, select: { id: true, login: true, role: true } });
  if (!account) return bad("Nie znaleziono konta", 404);
  if (account.role !== "RECEPTION") return bad("Osoby z PIN-em można dodawać tylko do kont recepcji.");

  if (await pinTakenOnAccount(account.id, parsed.data.pin)) {
    return bad("Ten PIN jest już użyty przez inną osobę na tym koncie — wybierz inny.", 409);
  }

  const operator = await prisma.staffOperator.create({
    data: {
      userId: account.id,
      name: parsed.data.name,
      pinHash: await bcrypt.hash(parsed.data.pin, STAFF_BCRYPT_COST),
    },
    select: { id: true, name: true, createdAt: true, updatedAt: true },
  });

  await logAudit({
    actorId: user!.id,
    action: "CREATE",
    entity: "StaffOperator",
    entityId: operator.id,
    summary: `Dodano osobę „${operator.name}" z PIN-em do konta wspólnego „${account.login}"`,
    data: { accountId: account.id, operatorName: operator.name },
  });

  return NextResponse.json({ ok: true, operator });
}
