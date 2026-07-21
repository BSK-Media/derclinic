import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole, requireStrictRole, scopedLocationWhere } from "@/lib/api-helpers";
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

  const visibleWarehouse = await prisma.warehouse.findFirst({
    where: { id: params.id, ...scopedLocationWhere(user!) },
    select: { id: true },
  });
  if (!visibleWarehouse) return NextResponse.json({ ok: false, message: "Nie znaleziono magazynu" }, { status: 404 });

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

const DeleteSchema = z.object({
  password: z.string().min(1, "Wpisz hasło administratora"),
});

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const parsed = DeleteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: parsed.error.issues[0]?.message ?? "Wpisz hasło administratora" },
      { status: 400 },
    );
  }

  const admin = await prisma.user.findUnique({
    where: { id: user!.id },
    select: { passwordHash: true },
  });
  if (!admin?.passwordHash || !(await bcrypt.compare(parsed.data.password, admin.passwordHash))) {
    return NextResponse.json({ ok: false, message: "Nieprawidłowe hasło administratora" }, { status: 401 });
  }

  const warehouse = await prisma.warehouse.findFirst({ where: { id: params.id, ...scopedLocationWhere(user!) } });
  if (!warehouse) {
    return NextResponse.json({ ok: false, message: "Nie znaleziono magazynu" }, { status: 404 });
  }

  await prisma.warehouse.delete({ where: { id: params.id } });
  await logAudit({
    actorId: user!.id,
    action: "DELETE",
    entity: "Warehouse",
    entityId: params.id,
    data: { name: warehouse.name, locationId: warehouse.locationId },
  });

  return NextResponse.json({ ok: true });
}
