
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { SIDEBAR_PERMISSION_KEYS } from "@/lib/sidebar-permissions";

const PatchSchema = z.object({
  isVisible: z.boolean().optional(),
  isAvailable: z.boolean().optional(),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().or(z.literal("")).optional(),
  sidebarPermissions: z.array(z.enum(SIDEBAR_PERMISSION_KEYS)).optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const json = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, message: "Niepoprawne dane" }, { status: 400 });

  const data: any = {};
  if (parsed.data.isVisible !== undefined) data.isVisible = parsed.data.isVisible;
  if (parsed.data.isAvailable !== undefined) data.isAvailable = parsed.data.isAvailable;
  if (parsed.data.phone !== undefined) data.phone = parsed.data.phone || null;
  if (parsed.data.email !== undefined) data.email = parsed.data.email ? parsed.data.email : null;
  if (parsed.data.sidebarPermissions !== undefined) data.sidebarPermissions = parsed.data.sidebarPermissions;

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
      sidebarPermissions: true,
    },
  });

  await logAudit({ actorId: user!.id, action: "UPDATE", entity: "Specialist", entityId: updated.id, data });
  return NextResponse.json({ ok: true, specialist: updated });
}
