import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";

export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const warehouses = await prisma.warehouse.findMany({
    orderBy: [{ parentId: "asc" }, { name: "asc" }],
  });

  return NextResponse.json({ ok: true, warehouses });
}

const CreateSchema = z.object({
  name: z.string().min(2),
  parentId: z.string().optional().nullable(),
});

export async function POST(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const json = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, message: "Niepoprawne dane" }, { status: 400 });

  const wh = await prisma.warehouse.create({
    data: { name: parsed.data.name, parentId: parsed.data.parentId ?? null },
  });

  await logAudit({ actorId: user!.id, action: "CREATE", entity: "Warehouse", entityId: wh.id });

  return NextResponse.json({ ok: true, warehouse: wh });
}
