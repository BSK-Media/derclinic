
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";

const PatchSchema = z.object({
  isVisible: z.boolean().optional(),
  isAvailable: z.boolean().optional(),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().or(z.literal("")).optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const json = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, message: "Niepoprawne dane" }, { status: 400 });

  const data: any = {};
  if (parsed.data.isVisible !== undefined) data.isVisible = parsed.data.isVisible;
  if (parsed.data.isAvailable !== undefined) data.isAvailable = parsed.data.isAvailable;
  if (parsed.data.phone !== undefined) data.phone = parsed.data.phone || null;
  if (parsed.data.email !== undefined) data.email = parsed.data.email ? parsed.data.email : null;

  const updated = await prisma.user.update({
    where: { id: params.id },
    data,
    select: {
      id: true,
      specialistCode: true,
      name: true,
      login: true,
      role: true,
      email: true,
      phone: true,
      isVisible: true,
      isAvailable: true,
      avatarUrl: true,
      jobTitle: true,
      sourceProfileUrl: true,
    },
  });

  await logAudit({ actorId: user!.id, action: "UPDATE", entity: "Specialist", entityId: updated.id, data });
  return NextResponse.json({ ok: true, specialist: updated });
}
