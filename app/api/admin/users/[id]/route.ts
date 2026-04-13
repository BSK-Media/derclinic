import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";

const PatchSchema = z.object({
  name: z.string().min(2).optional(),
  role: z.enum(["ADMIN", "RECEPTION", "SPECIALIST"]).optional(),
  email: z.string().email().optional().or(z.literal("")).optional(),
  payoutPercent: z.number().int().min(0).max(100).optional(),
  phone: z.string().optional().or(z.literal("")).optional(),
  specialistCode: z.number().int().optional(),
  isVisible: z.boolean().optional(),
  isAvailable: z.boolean().optional(),
  avatarUrl: z.string().url().optional().or(z.literal("")).optional(),
  jobTitle: z.string().optional().or(z.literal("")).optional(),
  sourceProfileUrl: z.string().url().optional().or(z.literal("")).optional(),
  password: z.string().min(4).optional(),
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
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.role !== undefined) data.role = parsed.data.role;
  if (parsed.data.email !== undefined) data.email = parsed.data.email ? parsed.data.email : null;
  if (parsed.data.payoutPercent !== undefined) data.payoutPercent = parsed.data.payoutPercent;
  if (parsed.data.phone !== undefined) data.phone = parsed.data.phone || null;
  if (parsed.data.specialistCode !== undefined) data.specialistCode = parsed.data.specialistCode;
  if (parsed.data.isVisible !== undefined) data.isVisible = parsed.data.isVisible;
  if (parsed.data.isAvailable !== undefined) data.isAvailable = parsed.data.isAvailable;
  if (parsed.data.avatarUrl !== undefined) data.avatarUrl = parsed.data.avatarUrl || null;
  if (parsed.data.jobTitle !== undefined) data.jobTitle = parsed.data.jobTitle || null;
  if (parsed.data.sourceProfileUrl !== undefined) data.sourceProfileUrl = parsed.data.sourceProfileUrl || null;
  if (parsed.data.password) data.passwordHash = await bcrypt.hash(parsed.data.password, 10);

  const updated = await prisma.user.update({
    where: { id: params.id },
    data,
    select: { id: true, login: true, name: true, role: true, email: true, payoutPercent: true, phone: true, specialistCode: true, isVisible: true, isAvailable: true, avatarUrl: true, jobTitle: true },
  });

  await logAudit({ actorId: user!.id, action: "UPDATE", entity: "User", entityId: updated.id, data });

  return NextResponse.json({ ok: true, user: updated });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  if (params.id === user!.id) return NextResponse.json({ ok: false, message: "Nie możesz usunąć własnego konta." }, { status: 400 });

  await prisma.user.delete({ where: { id: params.id } });
  await logAudit({ actorId: user!.id, action: "DELETE", entity: "User", entityId: params.id });

  return NextResponse.json({ ok: true });
}
