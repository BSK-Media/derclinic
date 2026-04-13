import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";

const PatchSchema = z.object({
  name: z.string().min(2).optional(),
  parentId: z.string().optional().nullable(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const json = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, message: "Niepoprawne dane" }, { status: 400 });

  const updated = await prisma.warehouse.update({
    where: { id: params.id },
    data: { name: parsed.data.name, parentId: parsed.data.parentId === undefined ? undefined : (parsed.data.parentId ?? null) },
  });

  await logAudit({ actorId: user!.id, action: "UPDATE", entity: "Warehouse", entityId: updated.id });

  return NextResponse.json({ ok: true, warehouse: updated });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  await prisma.warehouse.delete({ where: { id: params.id } });
  await logAudit({ actorId: user!.id, action: "DELETE", entity: "Warehouse", entityId: params.id });

  return NextResponse.json({ ok: true });
}
