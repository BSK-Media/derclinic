import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";

const BodySchema = z.object({
  method: z.enum(["CASH", "CARD", "VOUCHER"]),
  amount: z.number().int().min(1),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireRole(user!.role, ["ADMIN", "RECEPTION"]);
  if (deny) return deny;

  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, message: "Niepoprawne dane" }, { status: 400 });

  const p = await prisma.payment.create({
    data: { appointmentId: params.id, method: parsed.data.method as any, amount: parsed.data.amount },
  });

  await logAudit({ actorId: user!.id, action: "CREATE", entity: "Payment", entityId: p.id, data: { appointmentId: params.id } });

  return NextResponse.json({ ok: true, payment: p });
}
