import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole, requireStrictRole, scopedLocationWhere } from "@/lib/api-helpers";
import { logAudit, diffFields } from "@/lib/audit";

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
    select: { id: true, name: true, parentId: true },
  });
  if (!visibleWarehouse) return NextResponse.json({ ok: false, message: "Nie znaleziono magazynu" }, { status: 404 });

  const json = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, message: "Niepoprawne dane" }, { status: 400 });

  const updated = await prisma.warehouse.update({
    where: { id: params.id },
    data: { name: parsed.data.name, parentId: parsed.data.parentId === undefined ? undefined : (parsed.data.parentId ?? null) },
  });

  const changes = diffFields(
    { name: visibleWarehouse.name, parentId: visibleWarehouse.parentId },
    { name: updated.name, parentId: updated.parentId },
  );
  await logAudit({
    actorId: user!.id,
    action: "UPDATE",
    entity: "Warehouse",
    entityId: updated.id,
    summary: changes?.name
      ? `Zmiana magazynu: nazwa „${visibleWarehouse.name}" → „${updated.name}"`
      : `Zmiana magazynu „${updated.name}"${changes?.parentId ? " (zmieniono magazyn nadrzędny)" : " (bez zmian wartości)"}`,
    data: { changes },
  });

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
    await logAudit({
      actorId: user!.id,
      action: "LOGIN_FAILED",
      entity: "Warehouse",
      entityId: params.id,
      summary: "Nieudana próba usunięcia magazynu: błędne hasło administratora",
      data: { reason: "wrong_password" },
    });
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
    summary: `Usunięcie magazynu „${warehouse.name}"`,
    data: { name: warehouse.name, locationId: warehouse.locationId },
  });

  return NextResponse.json({ ok: true });
}
