import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";

const PatchSchema = z.object({
  name: z.string().min(2).optional(),
  phone: z.string().optional().or(z.literal("")).optional(),
  email: z.string().email().optional().or(z.literal("")).optional(),
  note: z.string().optional().or(z.literal("")).optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireRole(user!.role, ["ADMIN", "RECEPTION"]);
  if (deny) return deny;

  const json = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, message: "Niepoprawne dane" }, { status: 400 });

  const updated = await prisma.patient.update({
    where: { id: params.id },
    data: {
      name: parsed.data.name,
      phone: parsed.data.phone === undefined ? undefined : (parsed.data.phone ? parsed.data.phone : null),
      email: parsed.data.email === undefined ? undefined : (parsed.data.email ? parsed.data.email : null),
      note: parsed.data.note === undefined ? undefined : (parsed.data.note ? parsed.data.note : null),
    },
  });

  await logAudit({ actorId: user!.id, action: "UPDATE", entity: "Patient", entityId: updated.id });

  return NextResponse.json({ ok: true, patient: updated });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  await prisma.patient.delete({ where: { id: params.id } });
  await logAudit({ actorId: user!.id, action: "DELETE", entity: "Patient", entityId: params.id });

  return NextResponse.json({ ok: true });
}
